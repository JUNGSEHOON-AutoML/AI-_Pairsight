import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { classify, parseCase, parseCases, summarize } from "../eval/metrics";
import { buildReport, type CaseResult } from "../eval/report";
import { pickProviders, providersForCase } from "../eval/providers";
import { decideVerdict } from "../lib/verdict";
import { collectEvidence } from "../lib/verification/engine";
import { loadTrustedSources } from "../lib/verification/trusted-sources";
import { GoogleVisionReverseSearch, type FetchLike } from "../lib/providers/google-vision";
import { ProviderError } from "../lib/providers/types";

describe("eval metrics", () => {
  it("classifies every case as 맞힘 / 판단 불가 / 오판; any differing decisive verdict is 오판", () => {
    expect(classify("edited", "edited")).toBe("correct");
    expect(classify("edited", "inconclusive")).toBe("missed");
    expect(classify("authentic", "edited")).toBe("wrong");
    expect(classify("miscontextualized", "authentic")).toBe("wrong");
    expect(classify("edited", "miscontextualized")).toBe("wrong"); // wrong kind of manipulation is still 오판
    expect(classify("edited", null)).toBe("error");
  });

  it("aggregates per ground-truth label", () => {
    const s = summarize([
      { id: "a", label: "edited", predicted: "edited" },
      { id: "b", label: "edited", predicted: "inconclusive" },
      { id: "c", label: "edited", predicted: "miscontextualized" },
      { id: "d", label: "authentic", predicted: "authentic" },
      { id: "e", label: "authentic", predicted: null },
    ]);
    expect(s).toMatchObject({ total: 5, ran: 4, outcomes: { correct: 2, missed: 1, wrong: 1, error: 1 } });
    expect(s.byLabel.edited).toMatchObject({ n: 3, ran: 3, correct: 1, missed: 1, wrong: 1, correctRate: 1 / 3, missedRate: 1 / 3 });
    expect(s.byLabel.authentic).toMatchObject({ n: 2, ran: 1, correct: 1, error: 1, correctRate: 1 });
    expect(s.byLabel.ai_generated).toMatchObject({ n: 0, correctRate: null });
    expect(s.byOutcome.wrong).toEqual(["c"]);
    expect(s.confusion.edited.miscontextualized).toBe(1);
  });

  it("rejects 판단 불가 as a ground-truth label, with an explanation", () => {
    expect(() => parseCase('{"id":"x","image":"a.jpg","label":"inconclusive"}', 4)).toThrow(/line 4: "inconclusive" is not a ground-truth label/);
  });

  it("parses a file, skipping comments and blank lines, and rejects duplicate ids", () => {
    const ok = '// c\n\n{"id":"a","image":"a.jpg","label":"edited"}\n{"id":"b","image":"b.jpg","label":"authentic"}\n';
    expect(parseCases(ok).map((c) => c.id)).toEqual(["a", "b"]);
    expect(() => parseCases('{"id":"a","image":"a.jpg","label":"edited"}\n{"id":"a","image":"b.jpg","label":"edited"}')).toThrow(/line 2: duplicate id a/);
  });

  it("puts 오판 first in the report, with every evidence card and the candidate numbers", () => {
    const wrong: CaseResult = {
      id: "kr-007", label: "edited", source: "원본 기사 https://www.yna.co.kr/view/1", claim: "어제 사진", claimedDate: "2026-10-01",
      v2: { verdict: "inconclusive", rule: "none" },
      v3: { verdict: "miscontextualized", reason: "이유 문장", missing: ["부족한 것"], rule: "v3.trusted_context", strength: "medium",
        headlineFinding: { kind: "trusted_same", text: "핵심 발견 문장", sourceUrl: null, sourceName: null, trusted: true, date: null, dateSource: null } },
      evidence: [
        { kind: "image_comparison", outcome: "neutral", strength: "medium", summary: "비교 요약", sourceUrl: "https://www.yna.co.kr/view/1", provider: "local", score: null },
        { kind: "exif", outcome: "neutral", strength: "weak", summary: "EXIF 없음", sourceUrl: null, provider: "local", score: null },
      ],
      matches: [{ url: "https://www.yna.co.kr/view/1", trusted: "연합뉴스", date: "2019-01-01", dateSource: "page_meta", dateDisputed: false, alignment: 0.98, alignedDistance: 3, changedFraction: 0.01, regions: 0 }],
    };
    const right: CaseResult = { id: "kr-001", label: "authentic", source: "", claim: "", claimedDate: null, v2: { verdict: "inconclusive", rule: "none" },
      v3: { verdict: "inconclusive", reason: "r", missing: [], rule: "none", strength: null, headlineFinding: null }, evidence: [] };
    const { markdown } = buildReport("live", "test", [right, wrong], new Date("2026-10-19T00:00:00Z"));
    const wrongAt = markdown.indexOf("## 오판 (v3, 1건)");
    expect(wrongAt).toBeGreaterThan(0);
    expect(wrongAt).toBeLessThan(markdown.indexOf("## 정답 라벨별 집계"));
    const section = markdown.slice(wrongAt, markdown.indexOf("## 정답 라벨별 집계"));
    for (const s of ["kr-007 — 정답 편집 조작 · 판정 맥락 조작", "이유 문장", "v3.trusted_context", "핵심 발견 문장", "원본 기사", "| 이미지 비교 |", "| 촬영 정보 (EXIF) |", "EXIF 없음", "연합뉴스", "부족한 것"]) {
      expect(section, s).toContain(s);
    }
    expect(section).not.toContain("kr-001");
    expect(markdown).toContain("| 편집 조작 | 1 | 0 | 0% | 0 | 0% | **1** | 0 |");
    expect(markdown).toContain("| 진짜 확인 | 1 | 0 | 0% | 1 | 100% | 0 | 0 |");
  });

  it("parses cases and rejects bad ones with the line number", () => {
    expect(parseCase('{"id":"x","image":"images/x.jpg","label":"edited","claim":"","claimedDate":null}', 3)).toMatchObject({ id: "x", claimedDate: null });
    expect(() => parseCase('{"id":"x","image":"a.jpg","label":"fake"}', 7)).toThrow(/line 7: label/);
    expect(() => parseCase('{"id":"x","image":"a.jpg","label":"edited","claimedDate":"2026/10/01"}', 2)).toThrow(/YYYY-MM-DD/);
    expect(() => parseCase(`{"id":"x","image":"a.jpg","label":"edited","claim":"${"가".repeat(201)}"}`, 1)).toThrow(/200/);
    expect(() => parseCase("{nope", 9)).toThrow(/line 9/);
  });

  it("defaults to free live mode; --mock is for fixtures; a Vision key is optional", () => {
    const saved = process.env.GOOGLE_VISION_API_KEY;
    delete process.env.GOOGLE_VISION_API_KEY;
    expect(pickProviders({ forceMock: false })).toMatchObject({ mode: "live", defaultSource: "none" });
    expect(pickProviders({ forceMock: true })).toMatchObject({ mode: "mock", defaultSource: "mock-search" });
    process.env.GOOGLE_VISION_API_KEY = "test-key";
    expect(pickProviders({ forceMock: false }).defaultSource).toBe("vision");
    if (saved == null) delete process.env.GOOGLE_VISION_API_KEY;
    else process.env.GOOGLE_VISION_API_KEY = saved;
  });

  it("parses sourceUrls: strings or {url, imageUrl}, public http(s) only, at most 5, de-duplicated", () => {
    const c = parseCase(JSON.stringify({ id: "x", image: "a.jpg", label: "edited", sourceUrls: [
      "https://www.yna.co.kr/view/1#top", { url: "https://www.yna.co.kr/view/1" }, { url: "https://news1.kr/a", imageUrl: "https://image.news1.kr/b.jpg" } ] }), 1);
    expect(c.sourceUrls).toEqual([{ url: "https://www.yna.co.kr/view/1" }, { url: "https://news1.kr/a", imageUrl: "https://image.news1.kr/b.jpg" }]);
    expect(parseCase('{"id":"x","image":"a.jpg","label":"edited"}', 1).sourceUrls).toEqual([]);
    for (const bad of [["ftp://a.kr/x"], ["https://a.kr/x?token=abc"], ["https://u:p@a.kr/"], "https://a.kr", [{ url: "https://a.kr", imageUrl: "javascript:1" }],
      ["https://a.kr/1", "https://a.kr/2", "https://a.kr/3", "https://a.kr/4", "https://a.kr/5", "https://a.kr/6"]]) {
      expect(() => parseCase(JSON.stringify({ id: "x", image: "a.jpg", label: "edited", sourceUrls: bad }), 5), JSON.stringify(bad)).toThrow(/line 5/);
    }
  });

  it("manual candidates skip search but still go through page fetch, image comparison and the verdict", async () => {
    const choice = pickProviders({ forceMock: true });
    const run = async (url: string) => {
      const c = parseCase(JSON.stringify({ id: "m", image: "x.png", label: "edited", sourceUrls: [url] }), 1);
      const { providers, source } = providersForCase(choice, c);
      expect(source).toBe("manual");
      expect(providers.reverseSearch.name).toBe("manual");
      const input = await providers.input.normalize({ bytes: await readFile("public/fixtures/inputs/trusted_edited.png"), mime: "image/png", pageUrl: null, publicImageUrl: null }, AbortSignal.timeout(30000));
      const collected = await collectEvidence(input, providers, AbortSignal.timeout(30000));
      return { collected, verdict: decideVerdict({ evidence: collected.evidence, matches: collected.matches, claimedDate: null, trustedSources: loadTrustedSources({ includeMock: true }) }) };
    };
    const right = await run("https://wire.example.test/2021/04/old-house");
    expect(right.collected.searchedProviders).toContain("수동 후보 (검색 안 함)");
    expect(right.collected.matches[0]?.url).toBe("https://wire.example.test/2021/04/old-house");
    expect(right.verdict).toMatchObject({ verdict: "edited", rule: "v3.trusted_edited" });
    // Hand-picked pages are not trusted blindly. A page that does not load gives no candidate and a warning...
    const missing = await run("https://news.example.test/does-not-exist");
    expect(missing.collected.matches).toEqual([]);
    expect(missing.collected.verification.warnings.join(" ")).toContain("후보 페이지 하나를 확인하지 못했어요");
    expect(missing.verdict.verdict).toBe("inconclusive");
    // ...and an untrusted page that compares as the same scene still does not decide anything on its own (v2 rule).
    const untrusted = await run("https://news.example.test/2024/05/street-cafe");
    expect(untrusted.collected.matches[0]?.comparison?.diffRegions.length).toBeGreaterThan(0);
    expect(untrusted.verdict.verdict).toBe("inconclusive");
  });
});

describe("Google Vision adapter (fake transport, no network)", () => {
  const image = async () => ({ bytes: new Uint8Array(await readFile("public/fixtures/inputs/edited.png")), mime: "image/png", sha256: "x", publicUrl: null });

  it("sends the key only in a header, strips metadata to JPEG, and maps pages to candidates", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 200, json: async () => ({ responses: [{ webDetection: { pagesWithMatchingImages: [
        { url: "https://www.yna.co.kr/view/1", fullMatchingImages: [{ url: "https://img.yna.co.kr/a.jpg" }] },
        { url: "https://blog.example.com/p", partialMatchingImages: [{ url: "https://blog.example.com/b.jpg" }] },
        { url: "javascript:alert(1)" },
        { pageTitle: "no url" },
      ] } }] }) };
    };
    const r = await new GoogleVisionReverseSearch("secret-key", fake).search(await image(), AbortSignal.timeout(10000));
    expect(calls[0].url).toBe("https://vision.googleapis.com/v1/images:annotate");
    expect(calls[0].url).not.toContain("secret-key");
    expect(calls[0].headers["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(calls[0].body);
    expect(body.requests[0].features[0].type).toBe("WEB_DETECTION");
    expect(Buffer.from(body.requests[0].image.content, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG
    expect(r.candidates).toEqual([
      { url: "https://www.yna.co.kr/view/1", provider: "google-vision-web-detection", imageUrl: "https://img.yna.co.kr/a.jpg" },
      { url: "https://blog.example.com/p", provider: "google-vision-web-detection", imageUrl: "https://blog.example.com/b.jpg" },
    ]);
    expect(r.candidates.every((c) => !("discoveredAt" in c))).toBe(true); // Vision gives no dates
  });

  it("maps HTTP errors and API errors to provider failures without leaking the key", async () => {
    const http: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const api: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ responses: [{ error: { code: 7, message: "API key secret-key invalid" } }] }) });
    for (const f of [http, api]) {
      const err = await new GoogleVisionReverseSearch("secret-key", f).search(await image(), AbortSignal.timeout(10000)).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(String(err.message)).not.toContain("secret-key");
    }
  });

  it("refuses to be constructed without a key", () => {
    expect(() => new GoogleVisionReverseSearch("")).toThrow();
  });
});
