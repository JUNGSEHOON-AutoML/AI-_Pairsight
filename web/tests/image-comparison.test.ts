import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { LocalImageComparisonProvider, perceptualHash, hammingDistance } from "../lib/verification/image-comparison";
const pair = (name: string) => readFile(`tests/fixtures/comparison/${name}`);
const compare = async (name: string) => new LocalImageComparisonProvider().compare(await pair(name), await pair("original.png"), AbortSignal.timeout(10000));
describe("real pixel pairs", () => {
  it("identical images have zero hash distance and no diff", async () => {
    const r = await compare("original.png"); expect(r.matched).toBe(true); expect(r.pHashDistance).toBe(0); expect(r.diffRegions).toEqual([]);
  });
  it("resize and JPEG compression preserve approximate match", async () => {
    const r = await compare("compressed.jpg"); expect(r.matched).toBe(true); expect(r.alignedDistance).toBeLessThan(12); expect(r.changedFraction).toBeLessThan(.02);
    const a = await perceptualHash(await pair("original.png")), b = await perceptualHash(await pair("compressed.jpg"));
    expect(hammingDistance(a, b)).toBeLessThan(12);
  });
  it("finds the actual edited rectangle and emits a bounded heatmap", async () => {
    const r = await compare("edited.png"); expect(r.matched).toBe(true); expect(r.changedFraction).toBeGreaterThan(.01);
    expect(r.diffRegions.some(b => b.x <= .75 && b.x + b.w >= .75 && b.y <= .5 && b.y + b.h >= .5)).toBe(true);
    const meta = await sharp(Buffer.from(r.heatmap.split(",")[1], "base64")).metadata(); expect(meta.width).toBe(128); expect(meta.height).toBe(128);
  });
  it("registers a crop without reporting it as local manipulation", async () => {
    const r = await compare("cropped.png"); expect(r.matched).toBe(true); expect(r.crop?.w).toBeCloseTo(.75); expect(r.crop?.x).toBeCloseTo(.125); expect(r.changedFraction).toBeLessThan(.03);
  });
  it("detects horizontal reflection", async () => {
    const r = await compare("flipped.png"); expect(r.matched).toBe(true); expect(r.flip).toBe("horizontal"); expect(r.changedFraction).toBeLessThan(.01);
  });
  it("normalizes global color correction", async () => {
    const r = await compare("color.png"); expect(r.matched).toBe(true); expect(r.colorAdjusted).toBe(true); expect(r.diffRegions).toEqual([]);
  });
  it("rejects unrelated and textureless pictures", async () => {
    expect((await compare("unrelated.png")).matched).toBe(false);
    const flat = await sharp({ create: { width: 200, height: 150, channels: 3, background: "white" } }).png().toBuffer();
    expect((await new LocalImageComparisonProvider().compare(flat, flat, AbortSignal.timeout(10000))).matched).toBe(false);
  });
});
