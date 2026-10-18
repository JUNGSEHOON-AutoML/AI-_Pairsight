// Real page → images extractor for user URLs. MVP scope: find the images on a page; the article text
// itself is not fact-checked (glossary.md, 범위). Every request goes through the SSRF guard.
import { fetch } from "undici";
import { ACCEPTED_MIME, MAX_IMAGE_BYTES } from "../domain";
import { assertFetchableUrl, BlockedUrlError, guardedAgent } from "../net/ssrf";
import type { FetchedImage, PageImage, UrlImageExtractor } from "./types";
import { ProviderError } from "./types";

const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_IMAGES = 20;

async function guardedGet(raw: string, signal: AbortSignal, accept: string) {
  let url = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let u: URL;
    try {
      u = assertFetchableUrl(url);
    } catch {
      throw new ProviderError("url_blocked", `blocked: ${url}`);
    }
    let res;
    try {
      res = await fetch(u, {
        dispatcher: guardedAgent,
        redirect: "manual",
        signal,
        headers: { accept, "user-agent": "PairsightBot/0.1 (+image verification)" },
      });
    } catch (e) {
      const cause = (e as { cause?: unknown }).cause;
      if (cause instanceof BlockedUrlError || (cause as { code?: string })?.code === "EBLOCKED") {
        throw new ProviderError("url_blocked", "blocked at connect");
      }
      throw new ProviderError("url_blocked", "fetch failed");
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) break;
      url = new URL(next, u).toString(); // re-checked on the next loop
      continue;
    }
    if (!res.ok) throw new ProviderError("url_blocked", `status ${res.status}`);
    return { res, finalUrl: u };
  }
  throw new ProviderError("url_blocked", "too many redirects");
}

async function readCapped(body: AsyncIterable<Uint8Array> | null, cap: number, code: "too_large" | "url_blocked") {
  if (!body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > cap) throw new ProviderError(code, "response too large");
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v != null) ?? null;

export function extractImageUrls(html: string, base: URL): PageImage[] {
  const out: PageImage[] = [];
  const seen = new Set<string>();
  const push = (src: string | null, alt: string | null) => {
    if (!src || src.startsWith("data:")) return;
    let abs: string;
    try {
      abs = new URL(src, base).toString();
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs, alt });
  };
  // Preview images first: they are usually the article's main photo.
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const prop = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (prop === "og:image" || prop === "twitter:image") push(attr(tag, "content"), "미리보기 이미지");
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) push(attr(tag, "src"), attr(tag, "alt"));
  return out.slice(0, MAX_IMAGES);
}

export class HttpUrlImageExtractor implements UrlImageExtractor {
  readonly name = "http";
  async listImages(pageUrl: string, signal: AbortSignal): Promise<PageImage[]> {
    const { res, finalUrl } = await guardedGet(pageUrl, signal, "text/html");
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new ProviderError("url_no_image", "not an HTML page");
    const html = new TextDecoder().decode(await readCapped(res.body, MAX_PAGE_BYTES, "url_blocked"));
    const images = extractImageUrls(html, finalUrl);
    if (images.length === 0) throw new ProviderError("url_no_image", "no images on page");
    return images;
  }
  async fetchImage(imageUrl: string, signal: AbortSignal): Promise<FetchedImage> {
    const { res } = await guardedGet(imageUrl, signal, "image/*");
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ACCEPTED_MIME.includes(mime)) throw new ProviderError("unsupported_type", mime);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) throw new ProviderError("too_large", "declared too large");
    return { bytes: await readCapped(res.body, MAX_IMAGE_BYTES, "too_large"), mime };
  }
}
