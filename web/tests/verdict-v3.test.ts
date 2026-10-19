import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Evidence, SourceMatch } from "../lib/domain";
import { SCENARIO_DATA, SCENARIOS } from "../lib/providers/mock/fixtures";
import { decideVerdict, describeRegions, formatGap, TRUSTED_RULES } from "../lib/verdict";
import {
  EMPTY_TRUSTED_LIST,
  findTrustedSource,
  loadTrustedSources,
  parseTrustedList,
} from "../lib/verification/trusted-sources";
import type { ComparisonResult } from "../lib/verification/types";

const LIST = parseTrustedList({
  version: "test",
  sources: [
    { id: "w", name: "예시 통신사", domains: ["wire.example.test"], category: "kr_wire", basis: "test" },
    { id: "g", name: "예시 기관", domains: ["go.example.test"], category: "government", basis: "test" },
  ],
});
const TRUSTED = "https://wire.example.test/2019/03/market";
const OTHER = "https://blog.example.test/post";

const cmp = (o: Partial<ComparisonResult> = {}): ComparisonResult => ({
  matched: true, pHashDistance: 4, alignedDistance: 4, alignmentScore: 0.97, changedFraction: 0.06,
  crop: null, flip: null, colorAdjusted: false, heatmap: "", referenceHash: "ref",
  diffRegions: [{ x: 0.7, y: 0.7, w: 0.2, h: 0.2, note: "" }], ...o,
});
const same = { changedFraction: 0.005, diffRegions: [] };
function match(url: string, o: Partial<SourceMatch> = {}, c: Partial<ComparisonResult> = {}): SourceMatch {
  const date = o.firstSeenAt ?? "2019-03-02";
  return {
    url, imageUrl: null, pageTitle: null, firstSeenAt: date, firstSeenSource: "page_meta", similarity: 0.97,
    isEarliest: false, diffRegions: [], provider: "t", verified: true, dateDisputed: false,
    dates: [{ value: date, source: "page_meta", sourceUrl: url, confidence: "medium", meaning: "publication_claim", imageBound: false }],
    comparison: cmp(c), ...o,
  };
}
const run = (matches: SourceMatch[], claimedDate: string | null = null, evidence: Evidence[] = [], trustedSources = LIST) =>
  decideVerdict({ evidence, matches, claimedDate, trustedSources });

describe("v3 편집 조작: trusted earlier original with local differences", () => {
  it("fires with medium strength and wording that does not assert intent", () => {
    const r = run([match(TRUSTED)]);
    expect(r).toMatchObject({ verdict: "edited", rule: "v3.trusted_edited", strength: "medium" });
    expect(r.reason).toContain("신뢰 출처 원본과 달라요");
    expect(r.reason).toContain("예시 통신사");
    expect(r.reason).toContain("오른쪽 아래 영역이 달라요"); // one region: no "등 1군데"
    expect(r.reason).not.toContain("등 1군데");
    expect(r.reason).toContain("누가 왜 바꿨는지는 판단하지 않아요");
    expect(r.reason).not.toMatch(/조작했|위조|가짜/);
  });

  it("is strong when a copy of the uploaded image is dated later than the trusted page", () => {
    const copy = match(OTHER, { firstSeenAt: "2024-01-01" }, same);
    expect(run([match(TRUSTED), copy])).toMatchObject({ verdict: "edited", strength: "strong" });
  });

  it("is strong when the trusted date is bound to the compared image in an archive capture", () => {
    const m = match(TRUSTED, { firstSeenSource: "wayback_first_capture",
      dates: [{ value: "2019-03-02", source: "wayback_first_capture", sourceUrl: TRUSTED, confidence: "medium", meaning: "page_capture", imageBound: true, imageHash: "ref" }] });
    expect(run([m])).toMatchObject({ verdict: "edited", strength: "strong" });
  });

  it("counterexample: the trusted outlet published later than a copy of the uploaded image", () => {
    const earlierCopy = match(OTHER, { firstSeenAt: "2018-12-01" }, same);
    expect(run([match(TRUSTED), earlierCopy]).verdict).toBe("inconclusive");
  });

  it("counterexample: an earlier copy known only from a search-discovery date still blocks the rule", () => {
    const earlierCopy = match(OTHER, { firstSeenAt: "2018-12-01", firstSeenSource: "search_discovered", dates: [] }, same);
    expect(run([match(TRUSTED), earlierCopy]).verdict).toBe("inconclusive");
  });

  it.each([
    ["alignment correlation below threshold", { alignmentScore: TRUSTED_RULES.minAlignment - 0.01 }],
    ["pHash distance after alignment too large", { alignedDistance: TRUSTED_RULES.maxAlignedDistance + 1 }],
    ["comparison did not match at all", { matched: false }],
    ["difference not local (most of the image changed)", { changedFraction: TRUSTED_RULES.maxLocalChange + 0.05 }],
    ["only a crop/colour change, no differing regions", { changedFraction: 0.01, diffRegions: [], crop: { x: 0, y: 0, w: 0.8, h: 0.8 }, colorAdjusted: true }],
  ])("counterexample: %s", (_name, c) => {
    expect(run([match(TRUSTED, {}, c as Partial<ComparisonResult>)]).verdict).toBe("inconclusive");
  });

  it("a small local edit (under 2% changed, one region) is a difference, never 'the same picture'", () => {
    // Mirrors the edited fixture: sign text changed + person added = 1.8% of the grid, 1 region.
    const small = { changedFraction: 0.018, diffRegions: [{ x: 0.6, y: 0.1, w: 0.3, h: 0.2, note: "" }] };
    expect(run([match(TRUSTED, {}, small)], "2026-10-01")).toMatchObject({ verdict: "edited", rule: "v3.trusted_edited" });
    expect(run([match(OTHER, {}, small)], null, [], EMPTY_TRUSTED_LIST).headlineFinding?.kind).toBe("difference");
  });

  it.each([
    ["page dates disagree (dateDisputed)", { dateDisputed: true }],
    ["only a search-discovery date", { firstSeenSource: "search_discovered" as const }],
    ["no date at all", { firstSeenAt: null, firstSeenSource: null, dates: [] }],
    ["page not actually fetched and verified", { verified: false }],
  ])("counterexample: %s", (_name, o) => {
    expect(run([match(TRUSTED, o as Partial<SourceMatch>)]).verdict).toBe("inconclusive");
  });

  it("counterexample: look-alike and untrusted domains keep the v2 rule (판단 불가)", () => {
    for (const url of ["https://wire.example.test.evil.test/a", "https://fakewire.example.test/a", OTHER]) {
      expect(run([match(url)]).verdict).toBe("inconclusive");
    }
  });

  it("conflict: a valid camera-capture C2PA record against a differing trusted original → 판단 불가", () => {
    const capture: Evidence = { kind: "c2pa", outcome: "supports_real", strength: "strong", score: null, summary: "", sourceUrl: null, provider: "t",
      details: { signatureValid: true, action: "camera_capture", noEdits: true } };
    expect(run([match(TRUSTED)], null, [capture])).toMatchObject({ verdict: "inconclusive", rule: "v3.capture_vs_trusted_conflict" });
  });
});

describe("v3 맥락 조작: the same picture on a trusted page, ≥30 days before the claimed date", () => {
  const t = (o: Partial<SourceMatch> = {}) => match(TRUSTED, o, same);

  it("fires with medium strength and states the gap", () => {
    const r = run([t()], "2026-10-01");
    expect(r).toMatchObject({ verdict: "miscontextualized", rule: "v3.trusted_context", strength: "medium" });
    expect(r.reason).toContain("2019-03-02");
    expect(r.reason).toContain("약 8년 일러서 맞지 않아요");
  });

  it("formats the gap for reading: days, months, years", () => {
    expect(formatGap(30)).toBe("30일");
    expect(formatGap(95)).toBe("약 3개월");
    expect(formatGap(2994)).toBe("약 8년");
  });

  it("boundary: exactly 30 days fires, 29 days does not", () => {
    expect(run([t({ firstSeenAt: "2026-09-01" })], "2026-10-01").verdict).toBe("miscontextualized");
    expect(run([t({ firstSeenAt: "2026-09-02" })], "2026-10-01").verdict).toBe("inconclusive");
  });

  it("counterexample: no claimed date → 판단 불가, and says the date is what is missing", () => {
    const r = run([t()]);
    expect(r.verdict).toBe("inconclusive");
    expect(r.missing).toContain("알려준 촬영 날짜가 없어 신뢰 출처 게시일과 비교하지 못했어요");
  });

  it("counterexample: trusted page published after the claimed date", () => {
    expect(run([t({ firstSeenAt: "2026-10-05" })], "2026-10-01").verdict).toBe("inconclusive");
  });

  it("counterexample: the page's dates conflict", () => {
    expect(run([t({ dateDisputed: true })], "2026-10-01").verdict).toBe("inconclusive");
  });

  it("counterexample: alignment failed, so the picture is not shown to be the same", () => {
    expect(run([match(TRUSTED, {}, { ...same, alignmentScore: 0.8 })], "2026-10-01").verdict).toBe("inconclusive");
  });

  it("counterexample: untrusted page with an old date keeps v2 (page dates alone are not enough)", () => {
    expect(run([match(OTHER, {}, same)], "2026-10-01").verdict).toBe("inconclusive");
  });
});

describe("v2 image-bound date rule: an edited copy is not 'the same picture'", () => {
  // An archive capture that verified the compared image was present on 2019-03-02.
  const bound = (c: Partial<ComparisonResult>) => match(OTHER, { firstSeenSource: "wayback_first_capture",
    dates: [{ value: "2019-03-02", source: "wayback_first_capture", sourceUrl: OTHER, confidence: "medium", meaning: "page_capture", imageBound: true, imageHash: "ref" }] }, c);
  const smallEdit = { changedFraction: 0.018, diffRegions: [{ x: 0.6, y: 0.1, w: 0.3, h: 0.2, note: "" }] };

  it("control: the same picture with a bound earlier date is still 맥락 조작 (v2)", () => {
    expect(run([bound(same)], "2026-10-01", [], EMPTY_TRUSTED_LIST)).toMatchObject({ verdict: "miscontextualized", rule: "v2.image_bound_date" });
  });

  it("counterexample: an edit under 2% that leaves a region is never called 맥락 조작", () => {
    const r = run([bound(smallEdit)], "2026-10-01", [], EMPTY_TRUSTED_LIST);
    expect(r.verdict).toBe("inconclusive");
    expect(r.missing).toContain("찾은 사진이 넣은 이미지와 충분히 같지 않아요");
    expect(r.missing).toContain("차이의 원인과 편집 이력을 확인하지 못했어요");
    expect(r.headlineFinding?.kind).toBe("difference");
  });

  it("counterexample: with the trusted list it is the same, because the page is not trusted", () => {
    expect(run([bound(smallEdit)], "2026-10-01").verdict).toBe("inconclusive");
  });
});

describe("v2 behaviour is preserved", () => {
  it("an empty trusted list makes every trusted-source case fall back to v2", () => {
    expect(run([match(TRUSTED)], null, [], EMPTY_TRUSTED_LIST).verdict).toBe("inconclusive");
    expect(run([match(TRUSTED, {}, same)], "2026-10-01", [], EMPTY_TRUSTED_LIST).verdict).toBe("inconclusive");
  });

  it("every fixture gets the same verdict with and without the trusted list (fixtures use untrusted domains)", () => {
    for (const s of SCENARIOS) {
      const d = SCENARIO_DATA[s];
      const a = decideVerdict({ evidence: d.evidence, matches: d.matches, claimedDate: null });
      const b = decideVerdict({ evidence: d.evidence, matches: d.matches, claimedDate: null, trustedSources: LIST });
      expect(b.verdict, s).toBe(a.verdict);
    }
  });

  it("v2's decisive rules win over v3 (a matching fact-check beats a trusted difference)", () => {
    const fact: Evidence = { kind: "fact_check", outcome: "supports_manipulated", strength: "strong", score: null, summary: "", sourceUrl: "https://fc.example.test/x", provider: "t",
      details: { claimMatched: true, imageMatched: true, pageVerified: true, assessment: "miscontextualized" } };
    expect(run([match(TRUSTED)], null, [fact])).toMatchObject({ verdict: "miscontextualized", rule: "v2.fact_check" });
  });
});

describe("headlineFinding", () => {
  it("shows the strongest observation even when the verdict is 판단 불가", () => {
    const r = run([match(TRUSTED, { firstSeenAt: null, firstSeenSource: null, dates: [] })]);
    expect(r.verdict).toBe("inconclusive");
    expect(r.headlineFinding).toMatchObject({ kind: "trusted_difference", trusted: true, sourceName: "예시 통신사" });
    expect(r.headlineFinding!.text).toBe("예시 통신사 페이지에 같은 장면의 사진이 있으며, 오른쪽 아래 영역이 달라요.");
  });

  it("includes the date and its meaning, and prefers trusted pages over other pages", () => {
    const r = run([match(OTHER, { firstSeenAt: "2018-01-01" }, same), match(TRUSTED, {}, same)]);
    expect(r.headlineFinding).toMatchObject({ kind: "trusted_same", date: "2019-03-02", dateSource: "page_meta" });
    expect(r.headlineFinding!.text).toBe("2019-03-02(게시) 예시 통신사 페이지에 같은 사진이 있어요.");
  });

  it("uses the host name for untrusted pages and never claims an original was confirmed", () => {
    const r = run([match(OTHER)], null, [], EMPTY_TRUSTED_LIST);
    expect(r.headlineFinding!.sourceName).toBe("blog.example.test");
    expect(r.headlineFinding!.text).not.toContain("원본");
  });

  it("is null when nothing was found", () => {
    expect(run([]).headlineFinding).toBeNull();
  });

  it("describes region positions in words", () => {
    expect(describeRegions([{ x: 0, y: 0, w: 0.2, h: 0.2, note: "" }])).toBe("왼쪽 위");
    expect(describeRegions([{ x: 0.4, y: 0.4, w: 0.2, h: 0.2, note: "" }])).toBe("가운데");
    expect(describeRegions([{ x: 0.8, y: 0.4, w: 0.1, h: 0.2, note: "" }, { x: 0.4, y: 0.8, w: 0.2, h: 0.1, note: "" }])).toBe("오른쪽·가운데 아래");
  });
});

describe("trusted-source list", () => {
  afterEach(() => {
    delete process.env.PAIRSIGHT_TRUSTED_SOURCES;
    delete (globalThis as { __pairsightTrusted?: unknown }).__pairsightTrusted;
    vi.restoreAllMocks();
  });

  it("matches exact domains and subdomains on a dot boundary only", () => {
    const list = parseTrustedList({ version: "t", sources: [{ id: "y", name: "Y", domains: ["yna.co.kr"], category: "kr_wire", basis: "" }, { id: "g", name: "G", domains: ["go.kr"], category: "government", basis: "" }] });
    expect(findTrustedSource("https://www.yna.co.kr/view/AKR1", list)?.id).toBe("y");
    expect(findTrustedSource("https://yna.co.kr./x", list)?.id).toBe("y");
    expect(findTrustedSource("https://www.mois.go.kr/x", list)?.id).toBe("g");
    for (const bad of ["https://yna.co.kr.evil.com/x", "https://fakeyna.co.kr/x", "https://ynа.co.kr/x" /* Cyrillic а */, "ftp://yna.co.kr/x", "not a url", "https://or.kr/x"]) {
      expect(findTrustedSource(bad, list), bad).toBeNull();
    }
  });

  it.each([
    ["unknown category", { id: "a", name: "A", domains: ["a.kr"], category: "blog", basis: "" }],
    ["no domains", { id: "a", name: "A", domains: [], category: "kr_press", basis: "" }],
    ["invalid domain", { id: "a", name: "A", domains: ["http://a.kr"], category: "kr_press", basis: "" }],
    ["single-label domain", { id: "a", name: "A", domains: ["kr"], category: "kr_press", basis: "" }],
  ])("rejects %s", (_n, source) => {
    expect(() => parseTrustedList({ version: "t", sources: [source] })).toThrow();
  });

  it("rejects duplicate ids", () => {
    const s = { id: "a", name: "A", domains: ["a.kr"], category: "kr_press", basis: "" };
    expect(() => parseTrustedList({ version: "t", sources: [s, s] })).toThrow(/duplicated/);
  });

  it("the shipped production list parses and contains no fixture domains; the mock list contains only .test", () => {
    const prod = loadTrustedSources();
    expect(prod.sources.length).toBeGreaterThan(10);
    expect(prod.sources.flatMap((s) => s.domains).some((d) => d.endsWith(".test"))).toBe(false);
    const withMock = loadTrustedSources({ includeMock: true });
    const added = withMock.sources.slice(prod.sources.length).flatMap((s) => s.domains);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((d) => d.endsWith(".test"))).toBe(true);
  });

  it("re-reads the file when it changes, and fails closed to an empty list when it is invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "trusted-"));
    const path = join(dir, "list.json");
    process.env.PAIRSIGHT_TRUSTED_SOURCES = path;
    writeFileSync(path, JSON.stringify({ version: "1", sources: [{ id: "a", name: "A", domains: ["a.kr"], category: "kr_press", basis: "" }] }));
    expect(loadTrustedSources().version).toBe("1");
    writeFileSync(path, JSON.stringify({ version: "2", sources: [] }));
    utimesSync(path, new Date(), new Date(Date.now() + 5000));
    expect(loadTrustedSources().version).toBe("2");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    writeFileSync(path, "{ not json");
    utimesSync(path, new Date(), new Date(Date.now() + 10000));
    expect(loadTrustedSources()).toEqual(EMPTY_TRUSTED_LIST);
    expect(err).toHaveBeenCalled();
  });
});
