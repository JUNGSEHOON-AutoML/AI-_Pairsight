import { load } from "cheerio";
import robotsParser from "robots-parser";
import { setTimeout as sleep } from "node:timers/promises";
import { fetch } from "undici";
import { assertFetchableUrl, guardedAgent } from "../net/ssrf";
import { ProviderError } from "../providers/types";
import type { Article, PageFetchProvider } from "./types";
import { excerpt, publicUrl } from "./retention";

export interface FetchResponse { status: number; headers: Record<string, string>; bytes: Uint8Array }
export type Transport = (url: string, signal: AbortSignal) => Promise<FetchResponse>;
const AGENT = "PairsightBot";
const PAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const denied = (reason: string): never => { throw new ProviderError("url_blocked", reason); };

/** No cookies, browser challenges, proxies, link following, sitemaps, or paywall retries. */
export const guardedTransport: Transport = async (url, signal) => {
  const response = await fetch(assertFetchableUrl(url), { dispatcher: guardedAgent, redirect: "manual", signal,
    headers: { "user-agent": "PairsightBot/0.2 (on-demand image verification)", accept: "text/html,text/plain,image/*" } });
  const bytes: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > IMAGE_LIMIT) denied("response too large");
    bytes.push(chunk);
  }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), bytes: Buffer.concat(bytes) };
};

export class PolicyFetch {
  private tails = new Map<string, Promise<void>>();
  private robots = new Map<string, { until: number; text: string }>();
  private next = new Map<string, number>();
  private last = new Map<string, number>();
  constructor(private transport: Transport, private intervalMs = 1000) {}

  private async get(url: string, signal: AbortSignal, delay = this.intervalMs) {
    const origin = assertFetchableUrl(url).origin;
    const previous = this.tails.get(origin) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>(resolve => { release = resolve; });
    this.tails.set(origin, tail);
    await previous;
    try {
      const now = Date.now(), start = Math.max(now, this.next.get(origin) ?? 0, (this.last.get(origin) ?? 0) + delay);
      if (start > now) await sleep(start - now, undefined, { signal });
      signal.throwIfAborted();
      this.last.set(origin, Date.now());
      this.next.set(origin, Date.now() + Math.max(this.intervalMs, delay));
      const response = await this.transport(url, signal);
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers["retry-after"];
        const ms = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry ?? "") - Date.now());
        this.next.set(origin, Date.now() + Math.max(60_000, Number.isFinite(ms) ? ms : 0));
      }
      return response;
    } finally {
      release();
      if (this.tails.get(origin) === tail) this.tails.delete(origin);
    }
  }

  private async permission(url: URL, signal: AbortSignal): Promise<number> {
    let cached = this.robots.get(url.origin);
    if (!cached || cached.until <= Date.now()) {
      let target = new URL("/robots.txt", url).href;
      let text: string | null = null;
      for (let hop = 0; hop <= 3; hop++) {
        const r = await this.get(target, signal);
        if (r.status >= 300 && r.status < 400 && r.headers.location) {
          const next = assertFetchableUrl(new URL(r.headers.location, target).href);
          if (next.origin !== url.origin) denied("cross-origin robots redirect not supported");
          target = next.href; continue;
        }
        if (r.status === 404 || r.status === 410) { text = ""; break; }
        if (r.status !== 200 || r.bytes.length > 512 * 1024) denied("robots unavailable");
        text = new TextDecoder().decode(r.bytes);
        if (/^\s*</.test(text)) denied("robots is not a robots.txt response");
        break;
      }
      if (text === null) denied("robots redirect limit");
      cached = { text: text!, until: Date.now() + 3600_000 };
      this.robots.set(url.origin, cached!);
    }
    const policy = robotsParser(new URL("/robots.txt", url).href, cached!.text);
    if (policy.isAllowed(url.href, AGENT) === false) denied("robots disallow");
    return Math.max(this.intervalMs, (policy.getCrawlDelay(AGENT) ?? 0) * 1000);
  }

  async fetch(url: string, signal: AbortSignal): Promise<FetchResponse & { url: string }> {
    let target = assertFetchableUrl(url);
    for (let hop = 0; hop <= 3; hop++) {
      const delay = await this.permission(target, signal);
      const r = await this.get(target.href, signal, delay);
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        target = assertFetchableUrl(new URL(r.headers.location, target).href); continue;
      }
      if (r.status !== 200) denied("page unavailable: " + r.status);
      if (/noarchive|nosnippet/i.test(r.headers["x-robots-tag"] ?? "")) denied("source disallows retention");
      return { ...r, url: target.href };
    }
    return denied("redirect limit");
  }
}

export function extractArticle(html: string, url: string): Article {
  const $ = load(html);
  if ($('[class*="paywall"], [id*="paywall"], #challenge-form, #cf-challenge-running').length ||
      /just a moment|attention required|verify you are human/i.test($("title").text())) denied("paywall or bot challenge");
  if (/noarchive|nosnippet/i.test($('meta[name="robots"]').attr("content") ?? "")) denied("source disallows retention");
  const dates: Article["dates"] = [];
  let review: Article["review"];
  const addDate = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now()) return;
    if (dates.some(d => d.value === value)) return;
    dates.push({ value, source: "page_meta", sourceUrl: url, confidence: "medium", meaning: "publication_claim", imageBound: false });
  };
  $('meta[property="article:published_time"],meta[itemprop="datePublished"]').each((_, el) => addDate($(el).attr("content")));
  const visit = (node: unknown, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) { node.slice(0, 20).forEach(n => visit(n, depth + 1)); return; }
    const obj = node as Record<string, unknown>;
    const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
    if (types.some(t => typeof t === "string" && /^(NewsArticle|Article|BlogPosting)$/.test(t))) {
      if (obj.isAccessibleForFree === false || obj.isAccessibleForFree === "False") denied("paywall metadata");
      if (typeof obj.datePublished === "string") addDate(obj.datePublished);
    }
    if (types.includes("ClaimReview") && typeof obj.claimReviewed === "string") {
      const rating = obj.reviewRating as Record<string, unknown> | undefined;
      const author = obj.author as Record<string, unknown> | undefined;
      review = { claim: excerpt(obj.claimReviewed), claimComplete: [...obj.claimReviewed].length <= 200, rating: excerpt(String(rating?.alternateName ?? "")), publisher: excerpt(String(author?.name ?? "")) };
    }
    if (obj["@graph"]) visit(obj["@graph"], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    let value: unknown;
    try { value = JSON.parse($(el).text()); } catch { return; }
    visit(value);
  });
  const title = excerpt($('meta[property="og:title"]').attr("content") ?? $("title").text());
  const images: Article["images"] = [];
  const seen = new Set<string>();
  const push = (raw: string | undefined, caption: string, role: "representative" | "body") => {
    if (!raw || images.length >= 12) return;
    let imageUrl: string | null;
    try { imageUrl = publicUrl(new URL(raw, url).href); } catch { return; }
    if (!imageUrl || seen.has(imageUrl)) return;
    seen.add(imageUrl); images.push({ url: imageUrl, alt: excerpt(caption), caption: excerpt(caption), role });
  };
  $('meta[property="og:image"],meta[name="twitter:image"]').each((_, el) => push($(el).attr("content"), "", "representative"));
  $("article img,main img,figure img").each((_, el) => {
    const caption = $(el).closest("figure").find("figcaption").text() || $(el).attr("alt") || "";
    push($(el).attr("src"), caption, "body");
    const existing = images.find(i => { try { return i.url === new URL($(el).attr("src") ?? "", url).href; } catch { return false; } });
    if (existing && caption) existing.caption = excerpt(caption);
  });
  if (images.length === 0) $("img").each((_, el) => push($(el).attr("src"), $(el).attr("alt") ?? "", "body"));
  // Only a single combined 200-character excerpt is retained; raw HTML/body is discarded.
  const text = excerpt(images.map(i => i.caption).filter(Boolean).join(" ") || title);
  return { url, title, excerpt: text, images, dates, ...(review ? { review } : {}) };
}

export class OnDemandPageProvider implements PageFetchProvider {
  readonly name = "policy-gated-single-page";
  constructor(private fetcher: PolicyFetch) {}
  async page(url: string, signal: AbortSignal) {
    const r = await this.fetcher.fetch(url, signal);
    if (!r.headers["content-type"]?.includes("html") || r.bytes.length > PAGE_LIMIT) denied("not a bounded HTML page");
    return extractArticle(new TextDecoder().decode(r.bytes), r.url);
  }
  async image(url: string, signal: AbortSignal) {
    const r = await this.fetcher.fetch(url, signal);
    const mime = (r.headers["content-type"] ?? "").split(";")[0];
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime) || r.bytes.length > IMAGE_LIMIT) denied("unsupported image");
    return { bytes: r.bytes, mime };
  }
}
