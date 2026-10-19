import { createHash } from "node:crypto";
import raw from "../../../tuning/thresholds.json";

export interface Thresholds {
  minSceneSimilarity: number; maxOutsideResidual: number; maxDiffAreaFraction: number; maxDiffRegionCount: number;
  minAlignment: number; maxAlignedDistance: number; sameImageMaxChange: number; maxLocalChange: number;
}
// Humans set the admissible search domain. An agent cannot add switches to disable safety rules.
const bounds: Record<keyof Thresholds, [number, number, boolean?]> = {
  minSceneSimilarity: [.5, .99], maxOutsideResidual: [0, .05], maxDiffAreaFraction: [.001, .2], maxDiffRegionCount: [1, 5, true],
  minAlignment: [.8, .999], maxAlignedDistance: [0, 24, true], sameImageMaxChange: [.001, .05], maxLocalChange: [.01, .3],
};
export function parseThresholds(value: unknown): Readonly<Thresholds> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid thresholds");
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).sort().join() !== Object.keys(bounds).sort().join()) throw new Error("Unexpected threshold keys");
  for (const [key, [min, max, integer]] of Object.entries(bounds)) {
    const n = obj[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
      throw new Error(`Invalid threshold: ${key}`);
  }
  if (Number(obj.sameImageMaxChange) > Number(obj.maxLocalChange)) throw new Error("Inconsistent change thresholds");
  return Object.freeze({ ...obj }) as Readonly<Thresholds>;
}
export const THRESHOLDS = parseThresholds(raw);
// A different profile must never reuse a comparison cached under the old profile.
export const THRESHOLD_FINGERPRINT = createHash("sha256").update(JSON.stringify(THRESHOLDS)).digest("hex");
