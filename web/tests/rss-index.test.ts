import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { collectFeeds } from "../lib/index/collector";
import { hashDistance, imageHashes } from "../lib/index/hashes";
import { parseFeed } from "../lib/index/rss";
import { IndexStore } from "../lib/index/store";
import { createMockProviders } from "../lib/providers";
import { INDEX_MAX_DISTANCE, RssIndexReverseSearch, indexLabel } from "../lib/providers/rss-index";
import { decideVerdict } from "../lib/verdict";
import { collectEvidence } from "../lib/verification/engine";
import { mockTransport } from "../lib/verification/mock";
import { type Transport, PolicyFetch } from "../lib/verification/page-fetch";
import { loadTrustedSources, parseTrustedList } from "../lib/verification/trusted-sources";

const tmpIndex = () => join(mkdtempSync(join(tmpdir(), "rss-index-")), "index.jsonl");
const spy = (inner: Transport) => {
  const calls: string[] = [];
  const t: Transport = async (url, signal) => { calls.push(url); return inner(url, signal); };
  return { t, calls };
};
const mockList = () => loadTrustedSources({ includeMock: true });
const collectMock = async (path: string, transport: Transport = mockTransport) =>
  collectFeeds({ sources: mockList(), fetcher: new PolicyFetch(transport, 0), store: new IndexStore(path) });

describe("RSS parsing (feed only, no article pages)", () => {
  it("reads RSS 2.0 media:content, enclosure and an <img> in the description, and Atom entries", () => {
    const rss = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
      <item><link>https://a.kr/1</link><pubDate>Mon, 12 Apr 2021 09:00:00 +0900</pubDate><media:content url="/img/1.jpg" medium="image"/></item>
      <item><link>https://a.kr/2</link><enclosure url="https://cdn.a.kr/2.png" type="image/png"/></item>
      <item><link>https://a.kr/3</link><description><![CDATA[<p>x</p><img src="https://cdn.a.kr/3.webp">]]></description></item>
      <item><link>https://a.kr/4</link><description>no image</description></item>
      <item><link>javascript:alert(1)</link></item></channel></rss>`;
    expect(parseFeed(rss, "https://a.kr/rss.xml")).toEqual([
      { link: "https://a.kr/1", publishedAt: "2021-04-12T00:00:00.000Z", imageUrl: "https://a.kr/img/1.jpg" },
      { link: "https://a.kr/2", publishedAt: null, imageUrl: "https://cdn.a.kr/2.png" },
      { link: "https://a.kr/3", publishedAt: null, imageUrl: "https://cdn.a.kr/3.webp" },
      { link: "https://a.kr/4", publishedAt: null, imageUrl: null },
    ]);
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><entry><link href="https://b.kr/x"/><published>2026-10-19T00:00:00Z</published><media:thumbnail url="https://b.kr/t.jpg"/></entry></feed>`;
    expect(parseFeed(atom, "https://b.kr/atom")).toEqual([{ link: "https://b.kr/x", publishedAt: "2026-10-19T00:00:00.000Z", imageUrl: "https://b.kr/t.jpg" }]);
    expect(parseFeed(rss, "https://a.kr/rss.xml", 2)).toHaveLength(2);
  });
});

describe("index hashes", () => {
  it("multi-scale centre hashes keep 60-90% crops within the index threshold; an unrelated image stays far", async () => {
    const base = await readFile("tests/fixtures/comparison/original.png");
    const original = await imageHashes(base);
    for (const s of [0.9, 0.8, 0.75, 0.6]) {
      const w = Math.round(800 * s), h = Math.round(600 * s);
      const crop = await sharp(base).extract({ left: Math.floor((800 - w) / 2), top: Math.floor((600 - h) / 2), width: w, height: h }).png().toBuffer();
      expect(hashDistance(original, await imageHashes(crop)), `crop ${s}`).toBeLessThanOrEqual(INDEX_MAX_DISTANCE);
    }
    // More pairings bring unrelated images closer (measured 28 with one crop, 20 with five); keep a clear margin.
    const unrelated = await imageHashes(await readFile("tests/fixtures/comparison/unrelated.png"));
    expect(hashDistance(original, unrelated)).toBeGreaterThanOrEqual(INDEX_MAX_DISTANCE + 8);
    expect(original.full).toMatch(/^[0-9a-f]{16}$/);
    expect(original.crops).toHaveLength(5);
  });
});

describe("collector", () => {
  it("requests only allowed feeds; excluded and pending feeds are never touched", async () => {
    const { t, calls } = spy(mockTransport);
    const report = await collectMock(tmpIndex(), t);
    expect(calls).not.toContain("https://wire.example.test/private.xml");
    expect(calls.some((u) => /yna|donga|khan|sbs|hani|newsis|apnews/.test(u))).toBe(false);
    expect(report.notFetched.map((n) => n.status)).toEqual(expect.arrayContaining(["excluded", "pending"]));
  });

  it("with the production list nothing is requested at all (no feed is allowed today)", async () => {
    const { t, calls } = spy(mockTransport);
    const report = await collectFeeds({ sources: loadTrustedSources(), fetcher: new PolicyFetch(t, 0), store: new IndexStore(tmpIndex()) });
    expect(calls).toEqual([]);
    expect(report.runs).toEqual([]);
  });

  it("indexes items with images from the source's own domain, stores no bytes or text, and de-duplicates", async () => {
    const path = tmpIndex();
    const first = await collectMock(path);
    expect(first.runs[0]).toMatchObject({ url: "https://wire.example.test/rss.xml", added: 2, skipped: 2, stoppedReason: null });
    const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.articleUrl)).toEqual(["https://wire.example.test/2021/04/old-house", "https://wire.example.test/2018/07/park-festival"]);
    for (const l of lines) {
      expect(Object.keys(l).sort()).toEqual(["articleUrl", "collectedAt", "hashes", "imageUrl", "publishedAt", "sourceId", "v"]);
      expect(Object.keys(l.hashes).sort()).toEqual(["crops", "full"]);
    }
    expect(readFileSync(path, "utf8")).not.toMatch(/blog\.example\.test|본문|PNG|base64/);
    expect((await collectMock(path)).runs[0].added).toBe(0);
    expect(new IndexStore(path).meta.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stops the source when robots disallows, without fetching any image", async () => {
    const { t, calls } = spy(async (url, signal) =>
      url.endsWith("/robots.txt") ? { status: 200, headers: { "content-type": "text/plain" }, bytes: new TextEncoder().encode("User-agent: *\nDisallow: /\n") } : mockTransport(url, signal));
    const report = await collectMock(tmpIndex(), t);
    expect(report.runs[0].stoppedReason).toMatch(/robots/);
    expect(calls.filter((u) => !u.endsWith("/robots.txt"))).toEqual([]);
  });

  it("stops the source on a blocking status (429) instead of retrying", async () => {
    const path = tmpIndex();
    const { t, calls } = spy(async (url, signal) =>
      url.includes("assets.example.test/originals") ? { status: 429, headers: { "retry-after": "120" }, bytes: new Uint8Array() } : mockTransport(url, signal));
    const report = await collectMock(path, t);
    expect(report.runs[0].stoppedReason).toMatch(/429/);
    expect(calls.filter((u) => u.includes("/originals/"))).toHaveLength(1); // first image only, then stop
    expect(existsSync(path)).toBe(false);
  });

  it("rejects an allowed feed without evidence in the config", () => {
    expect(() => parseTrustedList({ version: "t", sources: [{ id: "a", name: "A", domains: ["a.kr"], category: "kr_press", basis: "",
      feeds: [{ url: "https://a.kr/rss", status: "allowed" }] }] })).toThrow(/evidence and checkedAt/);
  });
});

describe("RssIndexReverseSearch", () => {
  it("returns indexed candidates with the coverage label, and nothing for an unrelated image", async () => {
    const path = tmpIndex();
    await collectMock(path);
    const search = new RssIndexReverseSearch(path);
    const input = async (f: string) => ({ bytes: new Uint8Array(await readFile(f)), mime: "image/png", sha256: "x", publicUrl: null });
    const hit = await search.search(await input("public/fixtures/inputs/trusted_edited.png"), AbortSignal.timeout(10000));
    expect(hit.candidates[0]).toMatchObject({ url: "https://wire.example.test/2021/04/old-house", provider: "rss-index", discoveredAt: "2021-04-12" });
    expect(hit.searchedProviders[0]).toBe(indexLabel(new IndexStore(path).meta.startedAt));
    expect(hit.searchedProviders[0]).toMatch(/^신뢰 출처 RSS 색인 \(\d{4}-\d{2}-\d{2}부터 수집\)$/);
    const miss = await search.search(await input("tests/fixtures/comparison/unrelated.png"), AbortSignal.timeout(10000));
    expect(miss.candidates).toEqual([]);
  });

  it("end to end: index → candidate page check → comparison → v3, citing the right page", async () => {
    const path = tmpIndex();
    await collectMock(path);
    const p = { ...createMockProviders(), reverseSearch: new RssIndexReverseSearch(path) };
    const run = async (file: string, claimedDate: string | null) => {
      const input = await p.input.normalize({ bytes: await readFile(file), mime: "image/png", pageUrl: null, publicImageUrl: null }, AbortSignal.timeout(30000));
      const c = await collectEvidence(input, p, AbortSignal.timeout(30000));
      return { c, v: decideVerdict({ evidence: c.evidence, matches: c.matches, claimedDate, trustedSources: mockList() }) };
    };
    const edited = await run("public/fixtures/inputs/trusted_edited.png", null);
    expect(edited.v).toMatchObject({ verdict: "edited", rule: "v3.trusted_edited" });
    expect(edited.v.reason).toContain("2021-04-12");
    const context = await run("public/fixtures/inputs/trusted_context.png", "2026-10-01");
    expect(context.v).toMatchObject({ verdict: "miscontextualized", rule: "v3.trusted_context" });
    expect(context.v.reason).toContain("2018-07-21");
  });
});
