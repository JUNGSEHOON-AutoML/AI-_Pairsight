import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { decideVerdict } from "../../lib/verdict";
import { LOCAL_EDIT_LIMITS, passesLocalEditGuard, type EditLocalityLimits } from "../../lib/verification/edit-locality";
import { LocalImageComparisonProvider } from "../../lib/verification/image-comparison";
import { DinoSceneGate, SCENE_MIN_SIMILARITY, SCENE_MODEL } from "../../lib/verification/scene-gate";
import { EMPTY_TRUSTED_LIST, parseTrustedList } from "../../lib/verification/trusted-sources";
import type { ComparisonResult } from "../../lib/verification/types";
import type { SourceMatch } from "../../lib/domain";

export const ROOT = process.env.PAIRSIGHT_REAL_PHOTO_EVAL_DIR ?? "eval/real-photos";
export type Split = "calibration" | "validation";
export type Kind = "recompressed" | "edited" | "temporal" | "unrelated";
export interface Photo { id: string; camera: string; split: Split; file: string; sha256: string; date: string }
export interface Profile extends EditLocalityLimits { minSceneSimilarity: number }
export interface Pair { id: string; split: Split; kind: Kind; variant: string; input: string; reference: string; camera: string; otherCamera: string }
export interface Measurement extends Pair { inputSha256: string; referenceSha256: string; comparison: ComparisonResult }
export const BASELINE: Profile = { minSceneSimilarity: .76, maxOutsideResidual: .008, maxDiffAreaFraction: .08, maxDiffRegionCount: 2 };
export const currentProfile = (): Profile => ({ minSceneSimilarity: SCENE_MIN_SIMILARITY, ...LOCAL_EDIT_LIMITS });
export const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const trusted = parseTrustedList({ version: "evaluation-assumption-only", sources: [{ id: "controlled", name: "평가용 신뢰 출처 가정", domains: ["evaluation.example.test"], category: "government", basis: "Controlled candidate metadata, not actual publication verification" }] });
export async function json<T>(name: string): Promise<T> { return JSON.parse(await readFile(`${ROOT}/${name}`, "utf8")); }
export async function save(name: string, value: unknown) { await writeFile(`${ROOT}/${name}`, JSON.stringify(value, null, 2) + "\n"); }
async function exists(name: string) { try { await access(`${ROOT}/${name}`); return true; } catch { return false; } }

export function makePairs(photos: Photo[], split: Split): Pair[] {
  const selected = photos.filter(p => p.split === split).sort((a, b) => a.id.localeCompare(b.id));
  const pairs: Pair[] = [];
  const add = (a: Photo, b: Photo, kind: Kind, variant: string) => pairs.push({ id: `${a.id}~${b.id}~${variant}`, split, kind, variant, input: a.id, reference: b.id, camera: a.camera, otherCamera: b.camera });
  for (const p of selected) {
    for (const q of [40, 60, 80, 90]) add(p, p, "recompressed", `jpeg-${q}`);
    for (const variant of ["patch", "copy-move", "two-patches"]) add(p, p, "edited", variant);
  }
  const cameras = [...new Set(selected.map(p => p.camera))].sort();
  for (const camera of cameras) {
    const frames = selected.filter(p => p.camera === camera);
    for (const a of frames) for (const b of frames) if (a.id !== b.id) add(a, b, "temporal", "different-date");
  }
  for (const a of cameras) for (const b of cameras) if (a !== b) add(selected.find(p => p.camera === a)!, selected.find(p => p.camera === b)!, "unrelated", "different-camera");
  return pairs;
}

/** Deterministic controlled edits of licensed real photos, not samples of real-world misinformation. */
export async function pairBytes(pair: Pair, photos: Photo[]) {
  const load = async (id: string) => {
    const p = photos.find(p => p.id === id);
    if (!p) throw new Error(`Unknown image: ${id}`);
    const bytes = await readFile(`${ROOT}/${p.file}`);
    if (sha(bytes) !== p.sha256) throw new Error(`Image hash mismatch: ${id}`);
    return bytes;
  };
  const a = await load(pair.input), reference = await load(pair.reference);
  if (pair.kind === "recompressed") return { input: await sharp(a).jpeg({ quality: Number(pair.variant.slice(5)), chromaSubsampling: "4:2:0" }).toBuffer(), reference };
  if (pair.kind !== "edited") return { input: a, reference };
  const { width: w, height: h } = await sharp(a).metadata();
  if (!w || !h) throw new Error("Missing dimensions");
  const width = Math.round(w * .20), height = Math.round(h * .14);
  const left = Math.round(w * .62), top = Math.round(h * .52);
  const patch = pair.variant === "copy-move"
    ? await sharp(a).extract({ left: Math.round(w * .12), top: Math.round(h * .20), width, height }).png().toBuffer()
    : await sharp({ create: { width, height, channels: 3, background: { r: 220, g: 35, b: 50 } } }).png().toBuffer();
  const layers = [{ input: patch, left, top }];
  if (pair.variant === "two-patches") layers.push({ input: patch, left: Math.round(w * .18), top: Math.round(h * .60) });
  return { input: await sharp(a).composite(layers).jpeg({ quality: 80, chromaSubsampling: "4:2:0" }).toBuffer(), reference };
}

export function applyProfile(c: ComparisonResult, profile: Profile): ComparisonResult {
  // Measurements use the real model at threshold 0, so every pixel-aligned pair has all residual fields.
  const aligned = c.alignmentScore >= .9 && c.alignedDistance <= 18;
  const sceneRejected = c.sceneSimilarity !== null && c.sceneSimilarity < profile.minSceneSimilarity;
  return { ...c, matched: aligned && c.sceneSimilarity !== null && !sceneRejected, sceneRejected };
}
export function judge(row: Measurement, profile: Profile, v2 = false) {
  const c = applyProfile(row.comparison, profile);
  const match: SourceMatch = { url: `https://evaluation.example.test/${row.reference}`, imageUrl: null, pageTitle: null,
    firstSeenAt: "2000-01-01", firstSeenSource: "page_meta", similarity: c.alignmentScore,
    isEarliest: true, diffRegions: c.diffRegions, provider: "controlled-real-photo-evaluation", verified: true, comparison: c };
  return decideVerdict({ matches: c.matched ? [match] : [], evidence: [], claimedDate: null, trustedSources: v2 ? EMPTY_TRUSTED_LIST : trusted }, profile);
}
export function acceptedSamePhoto(c: ComparisonResult, profile: Profile) {
  const x = applyProfile(c, profile);
  return x.matched && passesLocalEditGuard(x, profile) && !x.diffRegions.length && x.changedFraction < .02;
}
export function summarize(rows: Measurement[], profile: Profile) {
  const kinds = ["recompressed", "edited", "temporal", "unrelated"] as const;
  const result = Object.fromEntries(kinds.map(kind => {
    const rs = rows.filter(r => r.kind === kind), decisions = rs.map(r => judge(r, profile));
    const edited = decisions.filter(d => d.verdict === "edited").length;
    const n = rs.length, misses = kind === "edited" ? n - edited : 0, falseEdits = kind === "edited" ? 0 : edited;
    return [kind, { n, edited, inconclusive: decisions.filter(d => d.verdict === "inconclusive").length, falseEdits, misses,
      falseEditRate: n ? falseEdits / n : null, missRate: kind === "edited" && n ? misses / n : null,
      samePhotoAccepted: rs.filter(r => acceptedSamePhoto(r.comparison, profile)).length,
      pixelAligned: rs.filter(r => r.comparison.matched).length,
      sceneRejected: rs.filter(r => applyProfile(r.comparison, profile).sceneRejected).length,
      localityRejected: rs.filter(r => applyProfile(r.comparison, profile).matched && !passesLocalEditGuard(r.comparison, profile)).length }];
  })) as Record<Kind, { n: number; edited: number; inconclusive: number; falseEdits: number; misses: number; falseEditRate: number | null; missRate: number | null; samePhotoAccepted: number; pixelAligned: number; sceneRejected: number; localityRejected: number }>;
  return result;
}

export async function measure(split: Split) {
  const sources = await json<{ images: Photo[]; protocolSha256: string }>("sources.json");
  const planHash = sha(await readFile(`${ROOT}/protocol.json`));
  if (sources.protocolSha256 !== planHash) throw new Error("Protocol changed after acquisition");
  const splitPhotos = sources.images.filter(p => p.split === split);
  if (splitPhotos.length !== 18 || new Set(splitPhotos.map(p => p.camera)).size !== 6) throw new Error("Expected all 18 photos of the preselected six cameras in this split");
  let frozenProfileSha256: string | null = null;
  if (split === "validation") {
    const frozen = await json<{ calibrationSha256: string; protocolSha256: string }>("frozen-profile.json");
    if (frozen.protocolSha256 !== planHash || frozen.calibrationSha256 !== sha(await readFile(`${ROOT}/measurements-calibration.json`))) throw new Error("Frozen calibration provenance mismatch");
    frozenProfileSha256 = sha(await readFile(`${ROOT}/frozen-profile.json`));
  }
  const pairs = makePairs(sources.images, split);
  const comparer = new LocalImageComparisonProvider(new DinoSceneGate(0));
  const rows: Measurement[] = [];
  for (const pair of pairs) {
    const { input, reference } = await pairBytes(pair, sources.images);
    const c = await comparer.compare(input, reference, AbortSignal.timeout(180000));
    rows.push({ ...pair, inputSha256: sha(input), referenceSha256: sha(reference), comparison: { ...c, heatmap: "" } });
    if (rows.length % 12 === 0) console.log(`${split}: ${rows.length}/${pairs.length}`);
  }
  await save(`measurements-${split}.json`, { protocolSha256: planHash, sourceSubsetSha256: sha(JSON.stringify(splitPhotos)), frozenProfileSha256,
    software: { node: process.version, sharp: sharp.versions.sharp, vips: sharp.versions.vips }, model: SCENE_MODEL, rows });
}

async function calibrate() {
  if (await exists("measurements-validation.json") || await exists("frozen-profile.json")) throw new Error("Calibration is locked; create a new study for further tuning, do not reuse this holdout");
  const { rows } = await json<{ rows: Measurement[] }>("measurements-calibration.json");
  const protocol = await json<{ search: { scene: number[]; residual: number[]; area: number[]; count: number[] } }>("protocol.json");
  const old = JSON.parse(await readFile("tests/fixtures/temporal/calibration.json", "utf8"));
  const synthetic = old.rows as { name: string; outsideResidual: number; diffAreaFraction: number; diffRegionCount: number }[];
  const candidates: { profile: Profile; summary: ReturnType<typeof summarize> }[] = [];
  for (const scene of protocol.search.scene) for (const residual of protocol.search.residual) for (const area of protocol.search.area) for (const count of protocol.search.count) {
    const profile = { minSceneSimilarity: scene, maxOutsideResidual: residual, maxDiffAreaFraction: area, maxDiffRegionCount: count };
    // Preserve all prior JPEG/edit calibration controls and reject both synthetic temporal directions.
    const valid = synthetic.every(r => {
      const pass = r.outsideResidual <= residual && r.diffAreaFraction <= area && r.diffRegionCount <= count;
      return r.name.startsWith("same-place") ? !pass : pass;
    });
    if (!valid) continue;
    const summary = summarize(rows, profile);
    if (Object.values(summary).some(s => s.falseEdits)) continue;
    candidates.push({ profile, summary });
  }
  candidates.sort((a, b) => b.summary.edited.edited - a.summary.edited.edited ||
    b.summary.recompressed.samePhotoAccepted - a.summary.recompressed.samePhotoAccepted ||
    a.summary.temporal.samePhotoAccepted - b.summary.temporal.samePhotoAccepted ||
    a.profile.maxOutsideResidual - b.profile.maxOutsideResidual || a.profile.maxDiffAreaFraction - b.profile.maxDiffAreaFraction ||
    a.profile.maxDiffRegionCount - b.profile.maxDiffRegionCount || Math.abs(a.profile.minSceneSimilarity - .76) - Math.abs(b.profile.minSceneSimilarity - .76));
  if (!candidates.length) throw new Error("No safe profile in the predeclared grid; report failure instead of tuning on holdout");
  const chosen = candidates[0];
  await save("calibration-selection.json", { baseline: { profile: BASELINE, summary: summarize(rows, BASELINE) }, chosen, feasibleProfiles: candidates.length,
    topProfiles: candidates.slice(0, 12), calibrationSha256: sha(await readFile(`${ROOT}/measurements-calibration.json`)), protocolSha256: sha(await readFile(`${ROOT}/protocol.json`)) });
  console.log(JSON.stringify(chosen, null, 2));
}

async function freeze() {
  const selection = await json<{ chosen: { profile: Profile }; calibrationSha256: string; protocolSha256: string }>("calibration-selection.json");
  const target = `${ROOT}/frozen-profile.json`;
  if (selection.calibrationSha256 !== sha(await readFile(`${ROOT}/measurements-calibration.json`)) || selection.protocolSha256 !== sha(await readFile(`${ROOT}/protocol.json`))) throw new Error("Calibration changed before freezing");
  await writeFile(target, JSON.stringify({ ...selection.chosen.profile, calibrationSha256: selection.calibrationSha256, protocolSha256: selection.protocolSha256, validationUsedForSelection: false,
    promotionRule: "Validation: zero false edited verdicts; zero temporal same-photo acceptances; edit misses no greater than baseline; JPEG acceptance no lower than baseline; existing synthetic regressions pass. Otherwise retain baseline, do not retune on this holdout." }, null, 2) + "\n", { flag: "wx" });
  console.log("Frozen before validation:", target);
}

async function report() {
  const frozen = await json<Profile>("frozen-profile.json");
  const validation = await json<{ frozenProfileSha256: string }>("measurements-validation.json");
  if (validation.frozenProfileSha256 !== sha(await readFile(`${ROOT}/frozen-profile.json`))) throw new Error("Profile changed after validation");
  const measured = await Promise.all((["calibration", "validation"] as const).map(async split => ({ split, ...(await json<{ rows: Measurement[] }>(`measurements-${split}.json`)) })));
  const comparisons = measured.map(({ split, rows }) => ({ split, baseline: summarize(rows, BASELINE), calibrated: summarize(rows, frozen),
    v2WithoutProvenance: { n: rows.length, inconclusive: rows.filter(r => judge(r, frozen, true).verdict === "inconclusive").length },
    cases: rows.map(r => ({ id: r.id, kind: r.kind, variant: r.variant, camera: r.camera, otherCamera: r.otherCamera,
      baseline: judge(r, BASELINE).verdict, calibrated: judge(r, frozen).verdict, rule: judge(r, frozen).rule, samePhotoAccepted: acceptedSamePhoto(r.comparison, frozen) })) }));
  const heldout = comparisons.find(r => r.split === "validation")!;
  const promotionAccepted = Object.values(heldout.calibrated).every(r => r.falseEdits === 0) && heldout.calibrated.temporal.samePhotoAccepted === 0 &&
    heldout.calibrated.edited.misses <= heldout.baseline.edited.misses && heldout.calibrated.recompressed.samePhotoAccepted >= heldout.baseline.recompressed.samePhotoAccepted;
  await save("results.json", { profile: frozen, baselineProfile: BASELINE, promotionAccepted, scope: "Image-comparison + actual v3 verdict under controlled trusted/earlier candidate metadata. No discovery/fetch/provenance accuracy claim.", comparisons });
  console.log("Validation promotion criteria:", promotionAccepted ? "pass (also requires regression tests)" : "FAIL; retain baseline");
  console.log(JSON.stringify(comparisons.map(r => ({ split: r.split, baseline: r.baseline, calibrated: r.calibrated, v2WithoutProvenance: r.v2WithoutProvenance })), null, 2));
}

async function main() {
  const [command, split] = process.argv.slice(2);
  if (command === "measure" && (split === "calibration" || split === "validation")) await measure(split);
  else if (command === "calibrate") await calibrate();
  else if (command === "freeze") await freeze();
  else if (command === "report") await report();
  else throw new Error("Usage: node --import tsx eval/real-photos/runner.ts measure calibration|validation / calibrate / freeze / report");
}
// Importable helpers for regression tests; importing must not perform an evaluation.
if (process.argv[1]?.endsWith("eval/real-photos/runner.ts")) main().catch(e => { console.error(e); process.exitCode = 1; });
