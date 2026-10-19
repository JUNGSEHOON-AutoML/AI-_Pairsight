// "Same scene" gate (replica/verification-pipeline.md §3-1).
// A candidate that passed pixel alignment can still be a different photo: two shots on the same studio backdrop,
// flat graphics, or scenes sharing a layout. An image embedding catches those. It is an exclusion gate only:
// a high similarity never counts as evidence for any verdict, a low one removes the candidate from comparison.
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { ProviderError } from "../providers/types";
import { DECODE_LIMIT } from "./retention";

/** DINOv2-small (Meta, Apache-2.0), ONNX conversion pinned to one revision; 8-bit weights (~25 MB). */
export const SCENE_MODEL = {
  id: "Xenova/dinov2-small",
  revision: "c2bb04a51fab207c420665f1946016107bffc701",
  dtype: "q8",
  license: "Apache-2.0 (facebook/dinov2-small)",
} as const;

/** Cosine similarity of the CLS embeddings below which a candidate is treated as a different scene.
 * Derived from scripts/measure-scene-gate.ts; see replica/verification-pipeline.md §3-1 for the numbers. */
export const SCENE_MIN_SIMILARITY = 0.76;

export interface SceneGate {
  readonly name: string;
  readonly minSimilarity: number;
  similarity(a: Uint8Array, b: Uint8Array, signal: AbortSignal): Promise<number>;
}

type Extractor = (image: unknown) => Promise<{ data: Float32Array; dims: number[] }>;
let extractor: Promise<Extractor> | null = null;

/** Loads once per process. Weights are downloaded on first use into PAIRSIGHT_MODEL_CACHE (default web/.cache/models). */
export function loadSceneModel(): Promise<Extractor> {
  extractor ??= (async () => {
    const t = await import("@huggingface/transformers");
    t.env.cacheDir = process.env.PAIRSIGHT_MODEL_CACHE ?? join(process.cwd(), ".cache", "models");
    t.env.allowLocalModels = false;
    const pipe = await t.pipeline("image-feature-extraction", SCENE_MODEL.id, {
      revision: SCENE_MODEL.revision, dtype: SCENE_MODEL.dtype,
      session_options: { intraOpNumThreads: Number(process.env.PAIRSIGHT_MODEL_THREADS ?? 2), interOpNumThreads: 1 },
    });
    return (async (image: unknown) => pipe(image as never)) as unknown as Extractor;
  })();
  extractor.catch(() => { extractor = null; }); // a failed download may succeed on the next request
  return extractor;
}

async function rawImage(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes, { limitInputPixels: DECODE_LIMIT, pages: 1 }).rotate()
    .flatten({ background: "#ffffff" }).removeAlpha().toColourspace("srgb")
    .resize(448, 448, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const { RawImage } = await import("@huggingface/transformers");
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

export class DinoSceneGate implements SceneGate {
  readonly name = "dinov2-small-scene-gate";
  readonly minSimilarity: number;
  private cache = new Map<string, Float32Array>(); // the upload is embedded once per request, not per candidate
  constructor(minSimilarity = SCENE_MIN_SIMILARITY) { this.minSimilarity = minSimilarity; }

  async embed(bytes: Uint8Array, signal: AbortSignal): Promise<Float32Array> {
    const key = createHash("sha256").update(bytes).digest("hex");
    const hit = this.cache.get(key);
    if (hit) return hit;
    let model: Extractor;
    try { model = await loadSceneModel(); }
    catch (e) { throw new ProviderError("provider_timeout", "scene model unavailable: " + (e as Error).message); }
    signal.throwIfAborted();
    const out = await model(await rawImage(bytes));
    signal.throwIfAborted();
    const width = out.dims[out.dims.length - 1];
    const cls = Float32Array.from(out.data.subarray(0, width)); // token 0 = CLS (after the final layer norm)
    let norm = 0;
    for (const v of cls) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < cls.length; i++) cls[i] /= norm;
    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, cls);
    return cls;
  }

  async similarity(a: Uint8Array, b: Uint8Array, signal: AbortSignal) {
    const [x, y] = [await this.embed(a, signal), await this.embed(b, signal)];
    let dot = 0;
    for (let i = 0; i < x.length; i++) dot += x[i] * y[i];
    return dot;
  }
}

let shared: DinoSceneGate | null = null;
export const defaultSceneGate = () => (shared ??= new DinoSceneGate());
