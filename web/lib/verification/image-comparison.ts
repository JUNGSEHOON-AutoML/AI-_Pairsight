import sharp from "sharp";
import type { ComparisonResult, ImageComparisonProvider } from "./types";
import { DECODE_LIMIT, hash } from "./retention";
import { defaultSceneGate, type SceneGate } from "./scene-gate";
import { THRESHOLDS } from "./thresholds";

const SIZE = 96;
type Raster = { data: Uint8Array; width: number; height: number };
type Transform = { x: number; y: number; w: number; h: number; flip: ComparisonResult["flip"] };
const identity: Transform = { x: 0, y: 0, w: 1, h: 1, flip: null };
const pixel = (r: Raster, x: number, y: number, c: number) =>
  r.data[(Math.min(r.height - 1, Math.max(0, Math.round(y))) * r.width + Math.min(r.width - 1, Math.max(0, Math.round(x)))) * 3 + c] / 255;
const sample = (r: Raster, t: Transform, x: number, y: number, c: number) => {
  const u = t.flip === "horizontal" ? 1 - x : x;
  const v = t.flip === "vertical" ? 1 - y : y;
  return pixel(r, (t.x + u * t.w) * (r.width - 1), (t.y + v * t.h) * (r.height - 1), c);
};
const gray = (r: Raster, t: Transform, x: number, y: number) =>
  .299 * sample(r, t, x, y, 0) + .587 * sample(r, t, x, y, 1) + .114 * sample(r, t, x, y, 2);

function dctHash(values: number[]): string {
  const coefficients: number[] = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let sum = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      sum += values[y * 32 + x] * Math.cos((2 * x + 1) * u * Math.PI / 64) * Math.cos((2 * y + 1) * v * Math.PI / 64);
    }
    coefficients.push(sum);
  }
  const median = [...coefficients.slice(1)].sort((a, b) => a - b)[31];
  return coefficients.map((v, i) => i > 0 && v > median ? "1" : "0").join("");
}
function rasterHash(r: Raster, t = identity) {
  return dctHash(Array.from({ length: 1024 }, (_, i) => gray(r, t, (i % 32) / 31, Math.floor(i / 32) / 31)));
}
export const hammingDistance = (a: string, b: string) => {
  if (a.length !== b.length) throw new Error("hash lengths differ");
  return [...a].reduce((n, c, i) => n + Number(c !== b[i]), 0);
};
async function raster(bytes: Uint8Array): Promise<Raster> {
  const data = await sharp(bytes, { limitInputPixels: DECODE_LIMIT, pages: 1 }).rotate()
    .flatten({ background: "#ffffff" }).removeAlpha().toColourspace("srgb")
    .resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer();
  return { data, width: SIZE, height: SIZE };
}
export async function perceptualHash(bytes: Uint8Array) { return rasterHash(await raster(bytes)); }

function correlation(a: Raster, b: Raster, t: Transform) {
  let sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
  const n = 24 * 24;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const av = gray(a, identity, x / 23, y / 23), bv = gray(b, t, x / 23, y / 23);
    sx += av; sy += bv; xx += av * av; yy += bv * bv; xy += av * bv;
  }
  const vx = xx - sx * sx / n, vy = yy - sy * sy / n;
  // Flat/low-information images cannot be reliably registered.
  if (vx / n < .001 || vy / n < .001) return 0;
  return Math.max(0, (xy - sx * sy / n) / Math.sqrt(vx * vy));
}

/** Bounded affine registration: resize, axis-aligned crop, horizontal/vertical reflection.
 * Perspective, arbitrary rotations, tiny crops and semantic intent are deliberately unsupported.
 */
export class LocalImageComparisonProvider implements ImageComparisonProvider {
  readonly name = "local-phash-diff-v1";
  /** sceneGate null = pixel gates only (measurement scripts and tests that isolate the pixel step). */
  constructor(private sceneGate: SceneGate | null = defaultSceneGate()) {}
  async compare(input: Uint8Array, reference: Uint8Array, signal: AbortSignal): Promise<ComparisonResult> {
    signal.throwIfAborted();
    const [a, b] = await Promise.all([raster(input), raster(reference)]);
    let best = identity, score = correlation(a, b, identity), objective = score;
    const fractions = [.5, .6, .7, .75, .8, .9, 1];
    for (const flip of [null, "horizontal", "vertical"] as const) {
      for (const w of fractions) for (const h of fractions) {
        signal.throwIfAborted();
        for (const dx of w === 1 ? [0] : [0, .25, .5, .75, 1]) for (const dy of h === 1 ? [0] : [0, .25, .5, .75, 1]) {
          const t = { x: dx * (1 - w), y: dy * (1 - h), w, h, flip };
          const s = correlation(a, b, t), penalized = s - (2 - w - h) * .025 - (flip ? .002 : 0);
          if (penalized > objective) { best = t; score = s; objective = penalized; }
        }
      }
    }
    const pHashDistance = hammingDistance(rasterHash(a), rasterHash(b));
    const alignedDistance = hammingDistance(rasterHash(a), rasterHash(b, best));
    const aligned = score >= THRESHOLDS.minAlignment && alignedDistance <= THRESHOLDS.maxAlignedDistance;
    // Pixel alignment accepts lookalikes (same backdrop, same layout). The scene gate can only exclude.
    const sceneSimilarity = aligned && this.sceneGate ? await this.sceneGate.similarity(input, reference, signal) : null;
    const sceneRejected = sceneSimilarity !== null && sceneSimilarity < this.sceneGate!.minSimilarity;
    const matched = aligned && !sceneRejected;
    const channels = [0, 1, 2].map(c => {
      let ma = 0, mb = 0, va = 0, vb = 0;
      for (let i = 0; i < 4096; i++) {
        const x = (i % 64) / 63, y = Math.floor(i / 64) / 63;
        const av = sample(a, identity, x, y, c), bv = sample(b, best, x, y, c);
        ma += av; mb += bv; va += av * av; vb += bv * bv;
      }
      ma /= 4096; mb /= 4096;
      const gain = Math.max(.5, Math.min(2, Math.sqrt(Math.max(0, vb / 4096 - mb * mb) / Math.max(.0001, va / 4096 - ma * ma))));
      return { gain, offset: mb - gain * ma };
    });
    let rawError = 0, correctedError = 0;
    for (let i = 0; i < 4096; i++) for (let c = 0; c < 3; c++) {
      const x = (i % 64) / 63, y = Math.floor(i / 64) / 63;
      const av = sample(a, identity, x, y, c), bv = sample(b, best, x, y, c);
      rawError += Math.abs(av - bv);
      correctedError += Math.abs(av * channels[c].gain + channels[c].offset - bv);
    }
    const colorAdjusted = matched && score > .98 && rawError / 12288 > .025 && correctedError < rawError * .45;
    const grid = Array<number>(256).fill(0);
    let changed = 0;
    const residuals: number[] = [];
    for (let i = 0; i < 4096; i++) {
      const x = (i % 64) / 63, y = Math.floor(i / 64) / 63;
      let error = 0;
      for (let c = 0; c < 3; c++) {
        let av = sample(a, identity, x, y, c);
        if (colorAdjusted) av = av * channels[c].gain + channels[c].offset;
        error += Math.abs(av - sample(b, best, x, y, c)) / 3;
      }
      residuals.push(error);
      if (error > .16) changed++;
      grid[Math.floor(Math.floor(i / 64) / 4) * 16 + Math.floor((i % 64) / 4)] += error / 16;
    }
    const diffRegions: ComparisonResult["diffRegions"] = [];
    const visited = new Set<number>();
    for (let i = 0; i < 256; i++) {
      if (!matched || grid[i] < .12 || visited.has(i)) continue;
      const queue = [i], points: number[] = [];
      visited.add(i);
      while (queue.length) {
        const at = queue.pop()!; points.push(at);
        const x = at % 16, y = Math.floor(at / 16);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const next = ny * 16 + nx;
          if (nx >= 0 && nx < 16 && ny >= 0 && ny < 16 && !visited.has(next) && grid[next] >= .12) {
            visited.add(next); queue.push(next);
          }
        }
      }
      if (points.length < 2) continue;
      const xs = points.map(p => p % 16), ys = points.map(p => Math.floor(p / 16));
      diffRegions.push({ x: Math.min(...xs) / 16, y: Math.min(...ys) / 16,
        w: (Math.max(...xs) - Math.min(...xs) + 1) / 16, h: (Math.max(...ys) - Math.min(...ys) + 1) / 16,
        note: "정렬 후에도 픽셀 차이가 남는 영역 (편집 의도는 확인하지 못함)" });
    }
    // Measure against every detected region, BEFORE truncating boxes for display. The outside
    // uses their union; the area budget conservatively sums boxes (overlap is counted twice).
    const outside = residuals.filter((_, i) => {
      const x = ((i % 64) + .5) / 64, y = (Math.floor(i / 64) + .5) / 64;
      return !diffRegions.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    });
    const outsideResidual = outside.length ? outside.reduce((sum, v) => sum + v, 0) / outside.length : null;
    const diffAreaFraction = diffRegions.reduce((sum, r) => sum + r.w * r.h, 0);
    const diffRegionCount = diffRegions.length;
    const rgba = Buffer.from(grid.flatMap(v => [230, 40, 30, Math.round(Math.min(1, v * 4) * 255)]));
    const heatmap = "data:image/png;base64," + (await sharp(rgba, { raw: { width: 16, height: 16, channels: 4 } })
      .resize(128, 128, { kernel: "nearest" }).png().toBuffer()).toString("base64");
    return { matched, sceneSimilarity, sceneRejected, pHashDistance, alignedDistance, alignmentScore: score,
      changedFraction: changed / 4096, outsideResidual, diffAreaFraction, diffRegionCount, crop: best.w < .99 || best.h < .99 ? { x: best.x, y: best.y, w: best.w, h: best.h } : null,
      flip: best.flip, colorAdjusted, diffRegions: diffRegions.slice(0, 8), heatmap, referenceHash: hash(reference) };
  }
}
