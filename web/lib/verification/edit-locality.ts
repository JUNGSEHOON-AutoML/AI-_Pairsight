import type { ComparisonResult } from "./types";
import { THRESHOLDS } from "./thresholds";

/** Real-photo pilot: 72 calibration JPEG pairs max outside MAE .019869;
 * frozen camera-disjoint validation and synthetic regressions in eval/real-photos/.
 * Not a population accuracy guarantee; see replica/verification-pipeline.md §3-3.
 */
export interface EditLocalityLimits {
  maxOutsideResidual: number;
  maxDiffAreaFraction: number;
  maxDiffRegionCount: number;
}

export const LOCAL_EDIT_LIMITS = {
  maxOutsideResidual: THRESHOLDS.maxOutsideResidual,
  maxDiffAreaFraction: THRESHOLDS.maxDiffAreaFraction,
  maxDiffRegionCount: THRESHOLDS.maxDiffRegionCount,
} as const;

/** Exclusion only. Passing does not prove an edit; missing/invalid measurements fail closed.
 * Also used for no-region matches so diffuse low-amplitude changes cannot become a date proof.
 */
export function passesLocalEditGuard(c: ComparisonResult, limits: EditLocalityLimits = LOCAL_EDIT_LIMITS): boolean {
  const residual = c.outsideResidual, area = c.diffAreaFraction, count = c.diffRegionCount;
  return typeof residual === "number" && Number.isFinite(residual) && residual >= 0 &&
    residual <= limits.maxOutsideResidual &&
    Number.isFinite(area) && area >= 0 && area <= limits.maxDiffAreaFraction &&
    Number.isInteger(count) && count >= 0 && count <= limits.maxDiffRegionCount;
}
