// "Same scene" gate: a different photo must never become the original an upload is compared against.
// Uses the real DINOv2-small model (downloaded once into .cache/models).
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createFreeProviders } from "../lib/providers";
import type { ReverseSearchProvider } from "../lib/providers/types";
import { decideVerdict } from "../lib/verdict";
import { collectEvidence } from "../lib/verification/engine";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
import { mockTransport } from "../lib/verification/mock";
import { DinoSceneGate, SCENE_MIN_SIMILARITY } from "../lib/verification/scene-gate";
import { loadTrustedSources } from "../lib/verification/trusted-sources";

const T = 180_000;
const bytes = async (p: string) => new Uint8Array(await readFile(p));
const scene = (s: string) => bytes(`public/fixtures/scenes/${s}.png`);
const signal = () => AbortSignal.timeout(T);
const gate = new DinoSceneGate();

describe("scene gate (DINOv2-small, exclusion only)", () => {
  it("keeps same-scene pairs: crop, flip, colour, recompression and a local edit", async () => {
    const pairs: [string, string][] = [
      ["tests/fixtures/comparison/cropped.png", "tests/fixtures/comparison/original.png"],
      ["tests/fixtures/comparison/flipped.png", "tests/fixtures/comparison/original.png"],
      ["tests/fixtures/comparison/color.png", "tests/fixtures/comparison/original.png"],
      ["tests/fixtures/comparison/compressed.jpg", "tests/fixtures/comparison/original.png"],
      ["tests/fixtures/comparison/edited.png", "tests/fixtures/comparison/original.png"],
      ["public/fixtures/inputs/trusted_edited.png", "public/fixtures/originals/trusted_edited.png"],
      ["public/fixtures/inputs/trusted_context.png", "public/fixtures/originals/trusted_context.png"],
    ];
    for (const [a, b] of pairs) expect(await gate.similarity(await bytes(a), await bytes(b), signal()), a).toBeGreaterThanOrEqual(SCENE_MIN_SIMILARITY);
    // Heavy crops are the closest same-scene pairs to the threshold (beach 60% crop ≈ 0.80); a stricter gate drops them.
    for (const s of ["beach", "fruit_table"]) {
      const full = await scene(s);
      const crop = new Uint8Array(await sharp(full).extract({ left: 160, top: 120, width: 480, height: 360 }).png().toBuffer());
      expect(await gate.similarity(crop, full, signal()), `${s} 60% crop`).toBeGreaterThanOrEqual(SCENE_MIN_SIMILARITY);
    }
  }, T);

  it("rejects unrelated scenes and same-backdrop lookalikes", async () => {
    const names = ["night_city", "beach", "forest", "fruit_table", "mountain_lake", "aerial_fields", "studio_teapot", "studio_plant", "studio_vase", "studio_bicycle"];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      expect(await gate.similarity(await scene(names[i]), await scene(names[j]), signal()), `${names[i]}~${names[j]}`).toBeLessThan(SCENE_MIN_SIMILARITY);
    }
  }, T);
});

describe("ai_generated fixture is its own scene", () => {
  // It used to share the street template with the other fixtures and came out 편집 조작 in mock free mode.
  it("no other fixture passes as its original, by pixels or by scene", async () => {
    const ai = await bytes("public/fixtures/inputs/ai_generated.png");
    const others = [
      ...["no_source", "inconclusive", "authentic", "miscontextualized", "edited", "trusted_edited", "trusted_context", "provider_timeout"].map((s) => `public/fixtures/inputs/${s}.png`),
      ...["authentic", "edited", "inconclusive", "miscontextualized", "trusted_edited", "trusted_context"].map((s) => `public/fixtures/originals/${s}.png`),
      ...["night_city", "beach", "forest", "fruit_table", "mountain_lake", "aerial_fields", "studio_teapot", "studio_plant", "studio_vase", "studio_bicycle"].map((s) => `public/fixtures/scenes/${s}.png`),
    ];
    const pixelsOnly = new LocalImageComparisonProvider(null);
    for (const o of others) {
      const other = await bytes(o);
      expect((await pixelsOnly.compare(ai, other, signal())).matched, o).toBe(false);
      expect(await gate.similarity(ai, other, signal()), o).toBeLessThan(SCENE_MIN_SIMILARITY);
    }
  }, T);
});

describe("counterexample: only different-scene candidates", () => {
  // Upload: studio_teapot. Candidates: three other studio photos on a (fictional) trusted wire page dated 2020-05-01.
  // Pixel alignment accepts all three as "the same picture with one changed region" (scripts/measure-scene-gate.ts),
  // so without the scene gate v3 would call the upload 편집 조작 against an unrelated earlier photo.
  const candidates: ReverseSearchProvider = {
    name: "fixed",
    search: async () => ({
      candidates: ["studio_plant", "studio_vase", "studio_bicycle"].map((s) => ({ url: `https://wire.example.test/scenes/${s}`, provider: "fixed" })),
      searchedProviders: ["고정 후보 (테스트)"],
    }),
  };
  const run = async (images: LocalImageComparisonProvider) => {
    const p = { ...createFreeProviders(mockTransport, "/nonexistent/index.jsonl"), reverseSearch: candidates, images };
    const input = await p.input.normalize({ bytes: await scene("studio_teapot"), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal());
    const c = await collectEvidence(input, p, signal());
    return { c, v: decideVerdict({ evidence: c.evidence, matches: c.matches, claimedDate: null, trustedSources: loadTrustedSources({ includeMock: true }) }) };
  };

  it("gate on: 판단 불가 + 원본 없음, not 편집 조작", async () => {
    const { c, v } = await run(new LocalImageComparisonProvider(gate));
    expect(v.verdict).toBe("inconclusive");
    expect(c.matches).toEqual([]); // nothing left to show as an original → the result screen shows 원본 없음
    expect(c.verification.verificationComplete).toBe(true); // a completed "different scene" result, not a failure
    expect(c.verification.discoveryComplete).toBe(true);
    expect(c.verification.warnings.join(" ")).toMatch(/다른 장면으로 보이는 후보 \d개는 원본 비교에서 뺐어요/);
  }, T);

  it("gate off (pixel gates only): the same candidates produce the dangerous 편집 조작", async () => {
    const { c, v } = await run(new LocalImageComparisonProvider(null));
    expect(c.matches.length).toBeGreaterThan(0);
    expect(v.verdict).toBe("edited");
  }, T);

  it("a real local edit of the same scene still passes the gate", async () => {
    const comparison = await new LocalImageComparisonProvider(gate).compare(
      await bytes("public/fixtures/inputs/trusted_edited.png"), await bytes("public/fixtures/originals/trusted_edited.png"), signal());
    expect(comparison).toMatchObject({ matched: true, sceneRejected: false });
    expect(comparison.diffRegions.length).toBeGreaterThan(0);
  }, T);
});
