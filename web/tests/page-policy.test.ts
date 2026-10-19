import { describe, expect, it } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import { extractArticle, PolicyFetch, OnDemandPageProvider, type FetchResponse, type Transport } from "../lib/verification/page-fetch";
import { excerpt, publicUrl, thumbnail } from "../lib/verification/retention";
import sharp from "sharp";
const response = (body: string, status = 200, headers = {}): FetchResponse => ({ bytes: new TextEncoder().encode(body), status, headers: { "content-type": "text/html", ...headers } });
const signal = () => AbortSignal.timeout(5000);
describe("page boundaries and robots", () => {
  it("fetches robots and exactly the requested page, never linked pages", async () => {
    const urls: string[] = [];
    const transport: Transport = async url => { urls.push(url); return response(url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : '<title>제목</title><a href="/other">next</a><article><img src="/img.png"></article>'); };
    const page = await new OnDemandPageProvider(new PolicyFetch(transport, 0)).page("https://news.example.test/one", signal());
    expect(urls).toEqual(["https://news.example.test/robots.txt", "https://news.example.test/one"]); expect(page.images).toHaveLength(1);
  });
  it("does not request a disallowed page or proceed when robots is inaccessible", async () => {
    for (const robots of [response("User-agent: *\nDisallow: /private"), response("Forbidden", 403), response("error", 500), response("<html>challenge</html>")]) {
      const urls: string[] = [];
      const fetcher = new PolicyFetch(async url => { urls.push(url); return robots; }, 0);
      await expect(fetcher.fetch("https://news.example.test/private", signal())).rejects.toThrow(); expect(urls).toHaveLength(1);
    }
  });
  it("checks robots on redirect destinations and prevents private targets", async () => {
    for (const location of ["http://127.0.0.1/admin", "https://other.example.test/blocked"]) {
      const urls: string[] = [];
      const fetcher = new PolicyFetch(async url => {
        urls.push(url);
        if (url.includes("other.example.test")) return response("User-agent: *\nDisallow: /");
        return url.endsWith("robots.txt") ? response("User-agent: *\nAllow: /") : response("", 302, { location });
      }, 0);
      await expect(fetcher.fetch("https://news.example.test/redirect", signal())).rejects.toThrow();
      expect(urls.some(u => u === location)).toBe(false);
    }
  });
  it("does not retry a 403 or 429 and respects cooldown on the next request", async () => {
    const urls: string[] = [];
    const fetcher = new PolicyFetch(async url => { urls.push(url); return url.endsWith("robots.txt") ? response("") : response("blocked", 429, { "retry-after": "120" }); }, 0);
    await expect(fetcher.fetch("https://news.example.test/a", signal())).rejects.toThrow();
    await expect(fetcher.fetch("https://news.example.test/b", AbortSignal.timeout(30))).rejects.toThrow();
    expect(urls.filter(u => !u.endsWith("robots.txt"))).toEqual(["https://news.example.test/a"]);
  });
  it("serializes concurrent requests and spaces their starts", async () => {
    let active = 0, max = 0; const starts: number[] = [];
    const fetcher = new PolicyFetch(async url => {
      starts.push(Date.now()); max = Math.max(max, ++active); await sleep(20); active--;
      return response(url.endsWith("robots.txt") ? "User-agent: *\nCrawl-delay: 0.05" : "page");
    }, 30);
    await Promise.all([fetcher.fetch("https://news.example.test/a", signal()), fetcher.fetch("https://news.example.test/b", signal())]);
    expect(max).toBe(1); expect(starts.slice(1).every((v, i) => v - starts[i] >= 28)).toBe(true);
    expect(starts.at(-1)! - starts.at(-2)!).toBeGreaterThanOrEqual(48);
  });
  it("extracts title, publication date, representative and body captions, but not modification date", () => {
    const page = extractArticle('<title>기사 제목</title><meta property="og:image" content="/hero.png"><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2020-01-02","dateModified":"2024-01-01"}</script><article><figure><img src="/hero.png"><figcaption>대표 캡션</figcaption></figure><figure><img src="/body.png"><figcaption>본문 캡션</figcaption></figure></article>', "https://news.example.test/a");
    expect(page.title).toBe("기사 제목"); expect(page.images.map(i => i.role)).toEqual(["representative", "body"]); expect(page.excerpt).toContain("대표 캡션");
    expect(page.dates).toHaveLength(1); expect(page.dates[0]).toMatchObject({ value: "2020-01-02", imageBound: false, confidence: "medium" });
  });
  it.each(['<div class="paywall">subscribe</div>', '<title>Just a moment</title>', '<meta name="robots" content="nosnippet">', '<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script>'])("stops on paywall/challenge/retention prohibition: %s", html => {
    expect(() => extractArticle(html, "https://news.example.test/a")).toThrow();
  });
});
describe("retention", () => {
  it("counts Unicode characters and rejects tokenized or non-public protocol URLs", () => {
    expect([...excerpt("😀".repeat(300))]).toHaveLength(200);
    for (const u of ["https://x.test/?token=secret", "https://user:pass@x.test", "file:///tmp/x"]) expect(publicUrl(u)).toBeNull();
  });
  it("strips EXIF and keeps only a thumbnail", async () => {
    const original = await sharp({ create: { width: 1000, height: 750, channels: 3, background: "red" } }).withExif({ IFD0: { Artist: "private" } }).jpeg().toBuffer();
    const clean = await sharp(await thumbnail(original)).metadata(); expect(clean.width).toBe(512); expect(clean.height).toBe(384); expect(clean.exif).toBeUndefined();
  });
});
