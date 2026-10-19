import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Evidence, SourceMatch, Verdict } from "../../lib/domain";

export const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export type Split = "dev" | "holdout";
export interface Asset { file: string; sha256: string }
export interface TuningCase {
  id: string; independentCaseId: string; splitGroup: string; humanReviewed: boolean; realPhoto: boolean;
  license: string; source: string; label: Exclude<Verdict, "inconclusive">;
  input: Asset; references: { image: Asset; match: SourceMatch }[];
  evidence: Evidence[]; claimedDate: string | null; claimText: string;
}
export interface Inventory {
  manifestSha256: string; cases: number; independentRealPhotos: number;
  groups: string[]; independentIds: string[]; imageHashes: string[];
}
export const manifestPath = (root: string, split: Split) => resolve(root, `tuning/datasets/${split}/cases.json`);
export function assetBytes(root: string, split: Split, asset: Asset): Buffer {
  const base = realpathSync(resolve(root, `tuning/datasets/${split}`));
  const path = realpathSync(resolve(base, asset.file));
  if (!path.startsWith(base + sep)) throw new Error("Dataset asset escapes split directory");
  const bytes = readFileSync(path);
  if (digest(bytes) !== asset.sha256) throw new Error("Dataset asset hash mismatch");
  return bytes;
}
export function loadCases(root: string, split: Split): TuningCase[] {
  const data = JSON.parse(readFileSync(manifestPath(root, split), "utf8"));
  if (data.version !== 1 || !Array.isArray(data.cases)) throw new Error("Invalid dataset manifest");
  const ids = new Set<string>();
  for (const c of data.cases as TuningCase[]) {
    if (!c.id || ids.has(c.id) || !c.independentCaseId || !c.splitGroup || !c.humanReviewed || !c.license ||
      !/^https:\/\//.test(c.source) || typeof c.realPhoto !== "boolean" || !["edited", "authentic", "ai_generated", "miscontextualized"].includes(c.label) ||
      !Array.isArray(c.references) || !Array.isArray(c.evidence)) throw new Error("Unreviewed or invalid tuning case");
    ids.add(c.id);
    assetBytes(root, split, c.input);
    for (const r of c.references) assetBytes(root, split, r.image);
  }
  return data.cases;
}
export function inventory(cases: TuningCase[], manifestSha256: string): Inventory {
  const real = cases.filter((c) => c.realPhoto);
  return { manifestSha256, cases: cases.length,
    independentRealPhotos: Math.min(new Set(real.map((c) => c.independentCaseId)).size, new Set(real.map((c) => c.input.sha256)).size),
    groups: [...new Set(cases.map((c) => digest(c.splitGroup)))].sort(),
    independentIds: [...new Set(cases.map((c) => digest(c.independentCaseId)))].sort(),
    imageHashes: [...new Set(cases.flatMap((c) => [c.input.sha256, ...c.references.map((r) => r.image.sha256)]))].sort() };
}
/** The loop reads only this sealed inventory + a byte hash, never holdout labels or scores. */
export function requireReady(dev: Inventory, holdout: Inventory, actualHoldoutHash: string) {
  if (dev.independentRealPhotos < 30) throw new Error("Refusing tuning: need at least 30 independent real-photo dev cases");
  if (!(holdout.cases > 0 && holdout.independentRealPhotos > 0) || holdout.manifestSha256 !== actualHoldoutHash)
    throw new Error("Refusing tuning: separate, manually sealed holdout required");
  for (const key of ["groups", "independentIds", "imageHashes"] as const) {
    if (!Array.isArray(holdout[key]) || !Array.isArray(dev[key]) || dev[key].some((x) => holdout[key].includes(x)))
      throw new Error("Refusing tuning: dev/holdout overlap or invalid inventory");
  }
}
