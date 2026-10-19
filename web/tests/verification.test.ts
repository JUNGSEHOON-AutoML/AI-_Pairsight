import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createMockProviders } from "../lib/providers";
import { collectEvidence, compareContext, type Collected } from "../lib/verification/engine";
import { MOCK_CLAIM, type Scenario } from "../lib/providers/mock/fixtures";
import { MockTemporaryImageProvider } from "../lib/verification/mock";
import { selectDate } from "../lib/verification/dates";
import type { DateRecord, ContextObservation } from "../lib/verification/types";
import { decideVerdict } from "../lib/verdict";
const signal = () => AbortSignal.timeout(30000);
async function fixture(s: Scenario) {
  const p = createMockProviders();
  const input = await p.input.normalize({ bytes: await readFile(`public/fixtures/inputs/${s}.png`), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal());
  return { p, input, collected: await collectEvidence(input, p, signal()) };
}
describe("verification pipeline using mock APIs and actual page extraction/pixel comparison", () => {
  it.each([
    ["authentic", "authentic"], ["ai_generated", "ai_generated"], ["edited", "edited"],
    ["miscontextualized", "miscontextualized"], ["inconclusive", "inconclusive"], ["no_source", "inconclusive"], ["fact_check_found", "inconclusive"],
  ] as const)("%s → %s", async (scenario, verdict) => {
    const { p, input, collected: c } = await fixture(scenario);
    const context = await compareContext({ text: scenario === "miscontextualized" ? MOCK_CLAIM : "", date: null }, c, p, signal());
    expect(p.verdict.decide({ matches: c.matches, evidence: [...c.evidence, ...context], claimedDate: null }).verdict).toBe(verdict);
    expect((p.temporaryImages as MockTemporaryImageProvider).activeCount).toBe(0);
    if (scenario === "fact_check_found") { expect(c.verification.factChecks).toHaveLength(1); expect(c.verification.factChecks[0].verified).toBe(true); }
    if (scenario === "no_source") expect(c.matches).toEqual([]);
    if (scenario === "edited") expect(c.matches[0]?.comparison?.diffRegions.length).toBeGreaterThan(0);
    if (scenario === "miscontextualized") expect(context.filter(e => e.kind === "context").map(e => e.details.dimension)).toEqual(["place", "date", "event"]);
    const meta = await sharp(input.thumbnail.bytes).metadata(); expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
    const stored = JSON.stringify(c); expect(stored).not.toContain("?token="); expect(stored).not.toContain("<html>");
    for (const s of c.verification.sources) expect([...s.excerpt].length).toBeLessThanOrEqual(200);
    for (const m of c.matches) { const size = await sharp(Buffer.from(m.imageUrl!.split(",")[1], "base64")).metadata(); expect(Math.max(size.width!, size.height!)).toBeLessThanOrEqual(512); }
  });
  it("rejects failure as failure, not no source", async () => {
    await expect(fixture("provider_timeout")).rejects.toMatchObject({ code: "provider_timeout" });
  });
  it("does not accept a fact-check's image match when the candidate differs in a region (edited copy)", async () => {
    for (const [regions, expected] of [[[], true], [[{ x: 0.6, y: 0.1, w: 0.3, h: 0.2, note: "" }], false]] as const) {
      const p = createMockProviders();
      const real = p.images.compare.bind(p.images);
      // Same real comparison, but force "under 2% changed" and either no region or one region.
      p.images.compare = async (a, b, s) => ({ ...(await real(a, b, s)), changedFraction: 0.015, diffRegions: [...regions] });
      const input = await p.input.normalize({ bytes: await readFile("public/fixtures/inputs/fact_check_found.png"), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal());
      const c = await collectEvidence(input, p, signal());
      expect(c.verification.factChecks[0].verified, `regions=${regions.length}`).toBe(expected);
    }
  });

  it("revokes temporary access even when fact search rejects and degrades explicitly", async () => {
    const { p, input } = await fixture("authentic");
    p.factCheck.search = async () => { throw new Error("API unavailable"); };
    const c = await collectEvidence(input, p, signal()); expect(c.verification.warnings).toContain("팩트체크 검색을 완료하지 못했어요.");
    expect((p.temporaryImages as MockTemporaryImageProvider).activeCount).toBe(0);
  });
  it("shared image evidence is unchanged across different claims", async () => {
    const { p, collected: c } = await fixture("miscontextualized"); const before = JSON.stringify(c);
    const a = await compareContext({ text: MOCK_CLAIM, date: null }, c, p, signal());
    const b = await compareContext({ text: "다른 사진 이야기", date: null }, c, p, signal());
    expect(decideVerdict({ evidence: a, matches: c.matches, claimedDate: null }).verdict).toBe("miscontextualized");
    expect(decideVerdict({ evidence: b, matches: c.matches, claimedDate: null }).verdict).toBe("inconclusive");
    expect(JSON.stringify(c)).toBe(before);
  });
  it("uses historical image binding, not page age, for a date contradiction", async () => {
    const { collected: c } = await fixture("miscontextualized");
    expect(decideVerdict({ evidence: [], matches: c.matches, claimedDate: "2026-10-01" }).verdict).toBe("miscontextualized");
    const unbound = c.matches.map(m => ({ ...m, dates: m.dates?.map(d => ({ ...d, imageBound: false })) }));
    expect(decideVerdict({ evidence: [], matches: unbound, claimedDate: "2026-10-01" }).verdict).toBe("inconclusive");
  });
  it("keeps a blocked candidate incomplete instead of claiming no source", async () => {
    const { p, input } = await fixture("authentic");
    p.candidates.verify = async () => { throw new Error("robots disallow"); };
    const c = await collectEvidence(input, p, signal()); expect(c.matches).toEqual([]);
    expect(c.verification.verificationComplete).toBe(false); expect(c.verification.warnings.length).toBeGreaterThan(0);
  });
  it("does not send an unverified API review snippet to the context model as fetched text", async () => {
    const { p, input } = await fixture("miscontextualized");
    const search = p.factCheck.search.bind(p.factCheck);
    p.factCheck.search = async (url, s) => (await search(url, s)).map(f => ({ ...f, publisher: "Wrong publisher" }));
    const c = await collectEvidence(input, p, signal());
    expect(c.verification.factChecks[0].verified).toBe(false);
    const reviewUrl = c.verification.factChecks[0].url;
    p.context.compare = async args => { expect(args.sources.some(s => s.url === reviewUrl)).toBe(false); return []; };
    const e = await compareContext({ text: MOCK_CLAIM, date: null }, c, p, signal());
    expect(e.find(e => e.kind === "fact_check")?.strength).toBe("medium");
    expect(c.matches.find(m => m.url === reviewUrl)?.excerpt).toBe("");
  });
  it("rejects hallucinated sources/quotes, caps LLM evidence and never lets it decide alone", async () => {
    const p = createMockProviders();
    const c: Collected = { matches: [{ url: "https://example.com/a" } as Collected["matches"][number]], evidence: [], searchedProviders: [],
      verification: { sources: [{ url: "https://example.com/a", excerpt: "부산 시장" }], factChecks: [], warnings: [] } };
    const observation = { dimension: "place", relation: "mismatch", sourceUrl: "https://example.com/a", quote: "부산 시장", explanation: "mismatch", strength: "strong" } as unknown as ContextObservation;
    p.context.compare = async () => [observation, { ...observation, sourceUrl: "https://invented.test" }, { ...observation, quote: "invented quote" }];
    const e = await compareContext({ text: "서울", date: null }, c, p, signal()); expect(e).toHaveLength(1); expect(e[0].strength).toBe("medium");
    expect(decideVerdict({ evidence: e, matches: [], claimedDate: null }).verdict).toBe("inconclusive");
  });
});
describe("date provenance", () => {
  const make = (source: DateRecord["source"], value: string): DateRecord => ({ source, value, confidence: "medium", sourceUrl: "https://example.com", meaning: "page_capture", imageBound: false });
  it("prioritizes metadata, then archive, then discovery and records conflicts", () => {
    const dates = [make("search_discovered", "2020-01-01"), make("wayback_first_capture", "2019-01-01"), make("page_meta", "2021-01-01")];
    expect(selectDate(dates).selected?.source).toBe("page_meta"); expect(selectDate(dates).disputed).toBe(true);
    expect(selectDate(dates.slice(0, 2)).selected?.source).toBe("wayback_first_capture");
    expect(selectDate([make("page_meta", "2099-01-01")]).selected).toBeNull();
  });
});
