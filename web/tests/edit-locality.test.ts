import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { decideVerdict } from "../lib/verdict";
import { LOCAL_EDIT_LIMITS, passesLocalEditGuard } from "../lib/verification/edit-locality";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
import { SCENE_MIN_SIMILARITY } from "../lib/verification/scene-gate";
import { EMPTY_TRUSTED_LIST, parseTrustedList } from "../lib/verification/trusted-sources";
import type { ComparisonResult } from "../lib/verification/types";
import type { Evidence, SourceMatch } from "../lib/domain";
import { SCENARIO_DATA } from "../lib/providers/mock/fixtures";
import { createFreeProviders } from "../lib/providers";
import { mockTransport } from "../lib/verification/mock";
import { collectEvidence } from "../lib/verification/engine";
const T = 180000;
const signal = () => AbortSignal.timeout(T);
const trusted = parseTrustedList({ version: "temporal-test", sources: [{ id: "wire", name: "예시 통신사", domains: ["wire.example.test"], category: "kr_wire", basis: "fixture" }] });
const asMatch = (comparison: ComparisonResult): SourceMatch => ({
  url: "https://wire.example.test/2020/street", imageUrl: null, pageTitle: null, firstSeenAt: "2020-01-01", firstSeenSource: "page_meta",
  similarity: comparison.alignmentScore, isEarliest: true, diffRegions: comparison.diffRegions, provider: "fixture", verified: true, comparison,
});
const decide = (comparison: ComparisonResult, evidence: Evidence[] = [], list = trusted) => decideVerdict({ matches: [asMatch(comparison)], evidence, trustedSources: list, claimedDate: null });
const synthetic = (o: Partial<ComparisonResult> = {}): ComparisonResult => ({
  matched: true, sceneSimilarity: .9, sceneRejected: false, pHashDistance: 4, alignedDistance: 4, alignmentScore: .97,
  changedFraction: .04, outsideResidual: .004, diffAreaFraction: .04, diffRegionCount: 1,
  diffRegions: [{ x: .4, y: .4, w: .2, h: .2, note: "difference" }], crop: null, flip: null, colorAdjusted: false, heatmap: "", referenceHash: "reference", ...o,
});
const c2paEdit = SCENARIO_DATA.edited.evidence.filter(e => e.kind === "c2pa");

describe("local edit guard", () => {
  it.each([
    ["residual", { outsideResidual: LOCAL_EDIT_LIMITS.maxOutsideResidual + .0001 }],
    ["area", { diffAreaFraction: LOCAL_EDIT_LIMITS.maxDiffAreaFraction + .0001 }],
    ["count", { diffRegionCount: LOCAL_EDIT_LIMITS.maxDiffRegionCount + 1 }],
  ] as const)("v2 and v3 reject when only %s exceeds its budget", (_, bad) => {
    const c = synthetic(bad);
    for (const list of [trusted, EMPTY_TRUSTED_LIST]) for (const evidence of [[], c2paEdit]) {
      expect(decide(c, evidence, list).verdict).toBe("inconclusive");
      expect(decide(c, evidence, list).headlineFinding?.text).toBe("같은 장소의 다른 사진일 수 있어요");
    }
  });
  it("accepts boundary values, with ordinary edit evidence still required", () => {
    const c = synthetic({ outsideResidual: LOCAL_EDIT_LIMITS.maxOutsideResidual, diffAreaFraction: LOCAL_EDIT_LIMITS.maxDiffAreaFraction, diffRegionCount: LOCAL_EDIT_LIMITS.maxDiffRegionCount });
    expect(passesLocalEditGuard(c)).toBe(true); expect(decide(c).rule).toBe("v3.trusted_edited");
    expect(decide(c, [], EMPTY_TRUSTED_LIST).verdict).toBe("inconclusive");
  });
  it.each([{ outsideResidual: undefined }, { outsideResidual: null }, { outsideResidual: NaN }, { outsideResidual: Infinity }, { outsideResidual: -.1 }, { diffAreaFraction: NaN }, { diffRegionCount: 1.5 }])("missing or invalid measurements fail closed: %o", bad => {
    expect(decide(synthetic(bad as Partial<ComparisonResult>)).verdict).toBe("inconclusive");
  });
  it("uses total count, not the eight displayed boxes", () => {
    const c = synthetic({ diffRegionCount: 9, diffRegions: Array(8).fill(synthetic().diffRegions[0]) });
    expect(decide(c).verdict).toBe("inconclusive");
  });
  it("does not call a diffuse change with no boxes the same picture for v2 date rules", () => {
    const c = synthetic({ diffRegions: [], diffRegionCount: 0, diffAreaFraction: 0, changedFraction: .005, outsideResidual: LOCAL_EDIT_LIMITS.maxOutsideResidual + .01 });
    const m = asMatch(c); m.dates = [{ value: "2020-01-01", source: "wayback_first_capture", sourceUrl: m.url, confidence: "medium", meaning: "page_capture", imageBound: true, imageHash: "reference" }];
    expect(decideVerdict({ matches: [m], evidence: [], trustedSources: EMPTY_TRUSTED_LIST, claimedDate: "2026-01-01" }).verdict).toBe("inconclusive");
  });
});

describe("actual pixel counterexample", () => {
  it("same place at different times stays inconclusive despite passing the scene gate and old edit conditions", async () => {
    const a = await readFile("tests/fixtures/temporal/street-morning.png"), b = await readFile("tests/fixtures/temporal/street-later.png");
    const c = await new LocalImageComparisonProvider().compare(b, a, signal());
    expect(c.matched).toBe(true); expect(c.sceneSimilarity).toBeGreaterThan(SCENE_MIN_SIMILARITY);
    expect(c.diffRegions.length).toBeGreaterThan(0); expect(c.changedFraction).toBeLessThan(.25);
    expect(c.outsideResidual).toBeGreaterThan(LOCAL_EDIT_LIMITS.maxOutsideResidual);
    expect(c.diffRegionCount).toBeGreaterThan(LOCAL_EDIT_LIMITS.maxDiffRegionCount);
    expect(decide(c)).toMatchObject({ verdict: "inconclusive", headlineFinding: { text: "같은 장소의 다른 사진일 수 있어요" } });
    expect(decide(c, c2paEdit, EMPTY_TRUSTED_LIST).verdict).toBe("inconclusive");
    const p = createFreeProviders(mockTransport, "/nonexistent/index.jsonl");
    p.reverseSearch.search = async () => ({ candidates: [{ url: asMatch(c).url, provider: "fixed" }], searchedProviders: ["fixture"] });
    p.candidates.verify = async candidate => ({ candidate, article: { url: candidate.url, title: "street", excerpt: "An earlier street view", images: [], dates: [] }, dates: [{ value: "2020-01-01", source: "page_meta", sourceUrl: candidate.url, confidence: "medium", meaning: "publication_claim", imageBound: false }], images: [{ url: "https://wire.example.test/a.png", bytes: a, mime: "image/png" }] });
    const input = await p.input.normalize({ bytes: b, mime: "image/png", pageUrl: null, publicImageUrl: null }, signal());
    const result = await collectEvidence(input, p, signal());
    expect(result.matches).toHaveLength(1); // keep the candidate and explain uncertainty, not "no source"
    expect(result.evidence.find(e => e.kind === "image_comparison")?.outcome).toBe("neutral");
    expect(decideVerdict({ matches: result.matches, evidence: result.evidence, claimedDate: null, trustedSources: trusted }).verdict).toBe("inconclusive");
  }, T);
  it.each(["edited", "trusted_edited"])("keeps the existing %s fixture edited", async name => {
    const c = await new LocalImageComparisonProvider().compare(await readFile(`public/fixtures/inputs/${name}.png`), await readFile(`public/fixtures/originals/${name}.png`), signal());
    expect(passesLocalEditGuard(c)).toBe(true); expect(decide(c).rule).toBe("v3.trusted_edited");
    expect(decide(c, c2paEdit, EMPTY_TRUSTED_LIST).rule).toBe("v2.ai_edited");
  }, T);
  it("JPEG calibration remains below the residual budget", async () => {
    const sharp = (await import("sharp")).default;
    const a = await readFile("tests/fixtures/comparison/original.png");
    const c = await new LocalImageComparisonProvider().compare(await sharp(a).jpeg({ quality: 60 }).toBuffer(), a, signal());
    expect(passesLocalEditGuard(c)).toBe(true);
  }, T);
});
