import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { applyProfile, BASELINE, currentProfile, json, judge, makePairs, pairBytes, ROOT, sha, summarize, type Measurement, type Photo, type Profile } from "../eval/real-photos/runner";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
import { DinoSceneGate } from "../lib/verification/scene-gate";

describe("licensed real-photo evaluation", () => {
  it("retains only attributed thumbnail files with verified hashes and camera-disjoint splits", async () => {
    const sources = await json<{ license: string; licenseUrl: string; protocolSha256: string; images: Photo[] }>("sources.json");
    const plan = await json<{ calibration: string[]; validation: string[] }>("protocol.json");
    expect(sources.license).toBe("CC-BY-4.0");
    expect(sources.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/legalcode");
    expect(sources.protocolSha256).toBe(sha(await readFile(`${ROOT}/protocol.json`)));
    expect(sources.images).toHaveLength(36);
    const calibration = new Set(sources.images.filter(p => p.split === "calibration").map(p => p.camera));
    const validation = new Set(sources.images.filter(p => p.split === "validation").map(p => p.camera));
    expect([...calibration].filter(c => validation.has(c))).toEqual([]);
    expect(calibration.size).toBe(6); expect(validation.size).toBe(6);
    expect([...calibration].sort()).toEqual([...plan.calibration].sort());
    expect([...validation].sort()).toEqual([...plan.validation].sort());
    for (const p of sources.images) {
      const bytes = await readFile(`${ROOT}/${p.file}`);
      expect(sha(bytes), p.id).toBe(p.sha256);
      const meta = await sharp(bytes).metadata();
      expect(Math.max(meta.width!, meta.height!), p.id).toBeLessThanOrEqual(512);
      expect(meta.exif, p.id).toBeUndefined();
    }
    for (const camera of [...calibration, ...validation]) expect(new Set(sources.images.filter(p => p.camera === camera).map(p => p.date)).size).toBe(3);
    const train = makePairs(sources.images, "calibration"), test = makePairs(sources.images, "validation");
    expect(train).toHaveLength(192); expect(test).toHaveLength(192);
    const trainImages = new Set(train.flatMap(p => [p.input, p.reference]));
    expect(test.some(p => trainImages.has(p.input) || trainImages.has(p.reference))).toBe(false);
  });

  it("keeps the selected profile frozen and reports missed edits as misses, including abstentions", async () => {
    const frozen = await json<Profile & { calibrationSha256: string; protocolSha256: string; validationUsedForSelection: boolean }>("frozen-profile.json");
    expect(frozen.validationUsedForSelection).toBe(false);
    expect(frozen.calibrationSha256).toBe(sha(await readFile(`${ROOT}/measurements-calibration.json`)));
    expect(frozen.protocolSha256).toBe(sha(await readFile(`${ROOT}/protocol.json`)));
    // Historical study stays frozen; production thresholds may advance only through the guarded ratchet.
    // The remaining tests still replay the frozen report and the real-pixel safety cases.
    const sources = await json<{ images: Photo[] }>("sources.json");
    const results = await json<{ promotionAccepted: boolean; comparisons: { split: string; calibrated: ReturnType<typeof summarize> }[] }>("results.json");
    expect(results.promotionAccepted).toBe(true);
    for (const split of ["calibration", "validation"]) {
      const { rows, sourceSubsetSha256, frozenProfileSha256 } = await json<{ rows: Measurement[]; sourceSubsetSha256: string; frozenProfileSha256: string | null }>(`measurements-${split}.json`);
      expect(sourceSubsetSha256).toBe(sha(JSON.stringify(sources.images.filter(p => p.split === split))));
      if (split === "validation") expect(frozenProfileSha256).toBe(sha(await readFile(`${ROOT}/frozen-profile.json`)));
      const summary = summarize(rows, frozen);
      expect(summary).toEqual(results.comparisons.find(r => r.split === split)!.calibrated);
      expect(summary.edited.edited + summary.edited.misses).toBe(54);
      expect(summary.edited.missRate).toBe(summary.edited.misses / 54);
      expect(summary.recompressed.n).toBe(72); expect(summary.temporal.n).toBe(36); expect(summary.unrelated.n).toBe(30);
      expect(rows.every(r => judge(r, frozen, true).verdict === "inconclusive")).toBe(true); // real photos carry no invented C2PA
    }
  });

  it("reproduces measured real pixels and decisions using the production provider", async () => {
    const sources = await json<{ images: Photo[] }>("sources.json");
    const { rows } = await json<{ rows: Measurement[] }>("measurements-validation.json");
    const results = await json<{ comparisons: { split: string; cases: { id: string; calibrated: string }[] }[] }>("results.json");
    const savedCases = results.comparisons.find(r => r.split === "validation")!.cases;
    // One case of each category, plus a detected edit and a missed edit when present.
    const selected = new Map<string, Measurement>();
    for (const kind of ["recompressed", "edited", "temporal", "unrelated"]) {
      const row = rows.find(r => r.kind === kind)!; selected.set(row.id, row);
    }
    for (const decision of ["edited", "inconclusive"]) {
      const row = rows.find(r => r.kind === "edited" && judge(r, currentProfile()).verdict === decision);
      if (row) selected.set(row.id, row);
    }
    const provider = new LocalImageComparisonProvider(new DinoSceneGate());
    for (const row of selected.values()) {
      const { input, reference } = await pairBytes(row, sources.images);
      expect(sha(input)).toBe(row.inputSha256); expect(sha(reference)).toBe(row.referenceSha256);
      const fresh = await provider.compare(input, reference, AbortSignal.timeout(180000));
      const expected = applyProfile(row.comparison, currentProfile());
      expect(fresh.matched, row.id).toBe(expected.matched);
      expect(fresh.sceneRejected, row.id).toBe(expected.sceneRejected);
      if (fresh.matched) {
        expect(fresh.outsideResidual!).toBeCloseTo(expected.outsideResidual!, 8);
        expect(fresh.diffAreaFraction).toBe(expected.diffAreaFraction);
        expect(fresh.diffRegionCount).toBe(expected.diffRegionCount);
      }
      expect(judge({ ...row, comparison: fresh }, currentProfile()).verdict).toBe(savedCases.find(r => r.id === row.id)!.calibrated);
    }
  }, 180000);

  it("does not turn missing scene measurements into matches in offline calibration", async () => {
    const { rows } = await json<{ rows: Measurement[] }>("measurements-calibration.json");
    const c = { ...rows[0].comparison, sceneSimilarity: null };
    expect(applyProfile(c, BASELINE).matched).toBe(false);
  });
});
