import type { ComparisonResult } from "./types";

/** Synthetic calibration only: 44 JPEG pairs max outside MAE .006069; positive edits
 * max area .035156 / 1 region. Rounded headroom, NOT a real-photograph accuracy claim.
 * See scripts/measure-edit-locality.ts and replica/verification-pipeline.md §3-2.
 */
export const LOCAL_EDIT_LIMITS = {
  maxOutsideResidual: 0.008, // mean absolute RGB error after registration/color normalization, 0..1
  maxDiffAreaFraction: 0.08, // sum of ALL bounding-box areas, before UI truncation
  maxDiffRegionCount: 2,
} as const;

/** Exclusion only. Passing does not prove an edit; missing/invalid measurements fail closed.
 * Also used for no-region matches so diffuse low-amplitude changes cannot become a date proof.
 */
export function passesLocalEditGuard(c: ComparisonResult): boolean {
  const residual = c.outsideResidual, area = c.diffAreaFraction, count = c.diffRegionCount;
  return typeof residual === "number" && Number.isFinite(residual) && residual >= 0 &&
    residual <= LOCAL_EDIT_LIMITS.maxOutsideResidual &&
    Number.isFinite(area) && area >= 0 && area <= LOCAL_EDIT_LIMITS.maxDiffAreaFraction &&
    Number.isInteger(count) && count >= 0 && count <= LOCAL_EDIT_LIMITS.maxDiffRegionCount;
}
