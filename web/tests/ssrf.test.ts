import { describe, expect, it } from "vitest";
import { extractImageUrls } from "../lib/providers/http-extractor";
import { assertFetchableUrl, isPublicAddress } from "../lib/net/ssrf";

describe("isPublicAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"])(
    "%s is blocked",
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("%s is allowed", (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

describe("assertFetchableUrl", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/a.png",
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://[::1]/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://user:pw@example.com/",
    "http://example.com:8080/",
    "http://metadata.google.internal/",
  ])("rejects %s", (u) => expect(() => assertFetchableUrl(u)).toThrow());
  it("accepts a normal https URL", () => expect(assertFetchableUrl("https://example.com/a").hostname).toBe("example.com"));
});

describe("extractImageUrls", () => {
  it("puts og:image first, resolves relative paths, skips data: and duplicates", () => {
    const html = `<meta property="og:image" content="/main.jpg">
      <img src="/main.jpg" alt="dup"><img src='a/b.png' alt='사진'><img src="data:image/png;base64,xx">`;
    const out = extractImageUrls(html, new URL("https://news.example.com/2026/article"));
    expect(out.map((i) => i.url)).toEqual(["https://news.example.com/main.jpg", "https://news.example.com/2026/a/b.png"]);
    expect(out[1].alt).toBe("사진");
  });
});
