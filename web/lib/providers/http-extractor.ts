// Compatibility adapter; all live fetching uses the same robots/rate/SSRF policy as candidate verification.
// Not selected in mock mode.
import type { PageImage, UrlImageExtractor } from "./types";
import { OnDemandPageProvider, PolicyFetch, guardedTransport } from "../verification/page-fetch";
const MAX_IMAGES = 12;
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
  readonly name = "policy-http";
  private pages = new OnDemandPageProvider(new PolicyFetch(guardedTransport));
  async listImages(url: string, signal: AbortSignal) { return (await this.pages.page(url, signal)).images; }
  fetchImage(url: string, signal: AbortSignal) { return this.pages.image(url, signal); }
}
