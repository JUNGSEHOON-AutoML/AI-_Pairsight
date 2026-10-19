// Verdict rules v3 = v2 + trusted-source rules (replica/verification-pipeline.md §5, replica/trusted-sources.md).
// Pure function, no I/O. The pixel model never decides a verdict on its own: it is always weak evidence.
// With an empty trusted-source list the result is exactly v2's (tests/verdict-v3.test.ts checks this).
import {
  DATE_SOURCE_LABEL,
  type DateSource,
  type Evidence,
  KIND_ORDER,
  type SourceMatch,
  type Strength,
  STRENGTH_RANK,
  type Verdict,
} from "./domain";
import { passesLocalEditGuard } from "./verification/edit-locality";
import { EMPTY_TRUSTED_LIST, findTrustedSource, type TrustedSource, type TrustedSourceList } from "./verification/trusted-sources";

// Cache schema version: old comparisons have no outside-residual/area/count measurements.
export const PIPELINE_VERSION = 4;

/**
 * v3 thresholds. Experimental, not calibrated on real news photos (replica/eval/ is where they get measured).
 * minAlignment / maxAlignedDistance repeat the comparison provider's own gate on purpose, so the verdict
 * does not silently loosen if that provider's thresholds change.
 */
export const TRUSTED_RULES = {
  minAlignment: 0.9, // luminance correlation after alignment
  maxAlignedDistance: 18, // pHash Hamming distance after alignment (of 63 bits)
  sameImageMaxChange: 0.02, // same picture: no differing region AND less than this fraction of changed cells
  maxLocalChange: 0.25, // above this the difference is not "local" any more (different photo, heavy edit)
  contextMinDays: 30, // trusted page date must be at least this many days before the claimed date
} as const;

export interface VerdictInput {
  evidence: Evidence[];
  matches: SourceMatch[];
  claimText?: string;
  claimedDate: string | null; // YYYY-MM-DD
  trustedSources?: TrustedSourceList; // omitted = empty = v2 behaviour
}

export type HeadlineKind = "fact_check" | "trusted_difference" | "trusted_same" | "difference" | "same" | "provenance" | "possible_different_photo";

/** The single strongest observation, shown even when the verdict is 판단 불가. Never a verdict in disguise. */
export interface HeadlineFinding {
  kind: HeadlineKind;
  text: string;
  sourceUrl: string | null;
  sourceName: string | null;
  trusted: boolean;
  date: string | null; // YYYY-MM-DD
  dateSource: DateSource | null;
}

export interface VerdictResult {
  verdict: Verdict;
  reason: string;
  missing: string[]; // what we could not establish, shown on the 판단 불가 screen
  rule: string; // which rule decided, e.g. "v2.fact_check", "v3.trusted_edited", "none"
  strength: Strength | null; // strength of the deciding evidence; null for 판단 불가
  headlineFinding: HeadlineFinding | null;
}

const strong = (e: Evidence) => e.strength === "strong";
const manip = (e: Evidence) => e.outcome === "supports_manipulated";
const real = (e: Evidence) => e.outcome === "supports_real";
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const daysBetween = (earlier: string, later: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000);
/** 45일 · 약 3개월 · 약 8년: a gap people can read at a glance. */
export function formatGap(days: number): string {
  if (days < 60) return `${days}일`;
  if (days < 730) return `약 ${Math.round(days / 30.44)}개월`;
  return `약 ${Math.round(days / 365.25)}년`;
}

const aligned = (m: SourceMatch) =>
  !!m.verified &&
  !!m.comparison?.matched &&
  m.comparison.alignmentScore >= TRUSTED_RULES.minAlignment &&
  m.comparison.alignedDistance <= TRUSTED_RULES.maxAlignedDistance;
// "Same picture" needs no differing region at all. A small edit can change under 2% of the grid and still
// leave a region (the sign/person fixture changes 1.8%), so the fraction alone must not decide sameness.
// Benign transforms (JPEG, crop, flip, colour) produce no regions (measured in tests/image-comparison.test.ts).
const sameImage = (m: SourceMatch) =>
  aligned(m) && passesLocalEditGuard(m.comparison!) && m.comparison!.diffRegions.length === 0 && m.comparison!.changedFraction < TRUSTED_RULES.sameImageMaxChange;
const localDifference = (m: SourceMatch) =>
  aligned(m) && passesLocalEditGuard(m.comparison!) && m.comparison!.diffRegions.length > 0 && m.comparison!.changedFraction <= TRUSTED_RULES.maxLocalChange;

// Keep these candidates visible as ambiguity; do not silently discard them as "no source".
const possibleDifferentPhoto = (m: SourceMatch) => aligned(m) && !passesLocalEditGuard(m.comparison!);
const ambiguousComparison = (matches: SourceMatch[]) =>
  !matches.some(m => sameImage(m) || localDifference(m)) && matches.some(possibleDifferentPhoto);

/** A page publication date or an archive capture, never a search engine's discovery date on its own. */
function pageDate(m: SourceMatch): { value: string; source: DateSource; imageBound: boolean } | null {
  if (m.dateDisputed || !m.firstSeenAt || !m.firstSeenSource) return null;
  if (m.firstSeenSource !== "page_meta" && m.firstSeenSource !== "wayback_first_capture") return null;
  const value = day(m.firstSeenAt)!;
  const bound = (m.dates ?? []).some((d) => d.imageBound && day(d.value) === value);
  return { value, source: m.firstSeenSource, imageBound: bound };
}

/** "오른쪽 아래", "왼쪽 위·가운데" — where the first differing regions sit in the input image. */
export function describeRegions(regions: SourceMatch["diffRegions"]): string {
  const where = (r: SourceMatch["diffRegions"][number]) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const h = cx < 1 / 3 ? "왼쪽" : cx > 2 / 3 ? "오른쪽" : "가운데";
    const v = cy < 1 / 3 ? "위" : cy > 2 / 3 ? "아래" : "";
    return h === "가운데" && !v ? "가운데" : h === "가운데" ? `가운데 ${v}` : v ? `${h} ${v}` : h;
  };
  return [...new Set(regions.slice(0, 2).map(where))].join("·");
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};
const DATE_WORD: Record<DateSource, string> = {
  page_meta: "게시",
  wayback_first_capture: "보관 기록",
  search_discovered: "검색 발견",
  tineye_crawl: "검색 발견",
};

export function headlineFinding(evidence: Evidence[], matches: SourceMatch[], trusted: TrustedSourceList): HeadlineFinding | null {
  if (ambiguousComparison(matches)) {
    const m = matches.filter(possibleDifferentPhoto).sort(closestFirst)[0];
    const t = findTrustedSource(m.url, trusted);
    return { kind: "possible_different_photo", text: "같은 장소의 다른 사진일 수 있어요", sourceUrl: m.url,
      sourceName: t?.name ?? hostOf(m.url), trusted: !!t, date: day(m.firstSeenAt), dateSource: m.firstSeenSource };
  }
  const fact = evidence.find((e) => e.kind === "fact_check" && strong(e) && manip(e));
  if (fact) {
    return { kind: "fact_check", text: `팩트체크 기관이 같은 이미지·같은 주장을 이미 검증했어요 (${hostOf(fact.sourceUrl ?? "")}).`,
      sourceUrl: fact.sourceUrl, sourceName: null, trusted: false, date: null, dateSource: null };
  }
  const byDate = (a: SourceMatch, b: SourceMatch) => (a.firstSeenAt ?? "9999").localeCompare(b.firstSeenAt ?? "9999");
  const pick = (pred: (m: SourceMatch, t: TrustedSource | null) => boolean) =>
    matches.filter((m) => pred(m, findTrustedSource(m.url, trusted))).sort(byDate)[0];
  const build = (m: SourceMatch, kind: HeadlineKind): HeadlineFinding => {
    const t = findTrustedSource(m.url, trusted);
    const name = t?.name ?? hostOf(m.url);
    const date = day(m.firstSeenAt);
    const when = date && m.firstSeenSource ? `${date}(${DATE_WORD[m.firstSeenSource]}) ` : "";
    const text = kind === "trusted_difference" || kind === "difference"
      ? `${when}${name} 페이지에 같은 장면의 사진이 있으며, ${describeRegions(m.comparison!.diffRegions)} 영역이 달라요.`
      : `${when}${name} 페이지에 같은 사진이 있어요.`;
    return { kind, text, sourceUrl: m.url, sourceName: name, trusted: !!t, date, dateSource: date ? m.firstSeenSource : null };
  };
  const closest = (pred: (m: SourceMatch, t: TrustedSource | null) => boolean) =>
    matches.filter((m) => pred(m, findTrustedSource(m.url, trusted))).sort(closestFirst)[0];
  // The uploaded picture itself on a trusted page is the strongest single observation.
  const m2 = pick((m, t) => !!t && sameImage(m));
  if (m2) return build(m2, "trusted_same");
  const m1 = closest((m, t) => !!t && localDifference(m));
  if (m1) return build(m1, "trusted_difference");
  const m3 = closest((m) => localDifference(m));
  if (m3) return build(m3, "difference");
  const m4 = pick((m) => sameImage(m) && !!m.firstSeenAt);
  if (m4) return build(m4, "same");
  const c2pa = evidence.find((e) => e.kind === "c2pa" && strong(e) && e.details.signatureValid === true);
  if (c2pa) return { kind: "provenance", text: "파일에 서명된 출처 기록(C2PA)이 있어요.", sourceUrl: null, sourceName: null, trusted: false, date: null, dateSource: null };
  const m5 = pick((m) => sameImage(m));
  if (m5) return build(m5, "same");
  return null;
}

/**
 * Closest match first: fewest changed cells, then fewest regions, then best alignment. When several trusted
 * pages show a similar scene, the one that actually is the source is the closest, not the oldest
 * (found with the RSS index: a similar 2018 scene was cited instead of the 2021 original).
 */
const closestFirst = (a: SourceMatch, b: SourceMatch) =>
  a.comparison!.changedFraction - b.comparison!.changedFraction ||
  a.comparison!.diffRegions.length - b.comparison!.diffRegions.length ||
  b.comparison!.alignmentScore - a.comparison!.alignmentScore;

/** 편집 조작 (v3): a trusted page published earlier shows the same scene with local differences. */
function trustedEdited(matches: SourceMatch[], trusted: TrustedSourceList) {
  // If a trusted source publishes the uploaded picture itself, unchanged, a difference to some *other* trusted
  // photo of a similar scene is not evidence of an edit (found with the RSS index: an exact 2021 copy plus a
  // similar 2018 scene was called 편집 조작).
  if (matches.some((m) => findTrustedSource(m.url, trusted) && sameImage(m))) return null;
  // Copies of the uploaded image (same picture) with a page date: if one predates the trusted page,
  // the trusted outlet may have published the altered version later, so the rule must not fire.
  // Any date counts for blocking (even a weak search discovery or a disputed one): blocking is the cautious side.
  const copies = matches.filter(sameImage);
  const copyDates = copies.map((m) => day(m.firstSeenAt)).filter((d): d is string => !!d).sort();
  const laterCopy = copies.some((m) => pageDate(m)); // a dated copy that is *later* than the trusted page (checked below)
  for (const m of matches.filter(localDifference).sort(closestFirst)) {
    const t = findTrustedSource(m.url, trusted);
    if (!t) continue;
    const d = pageDate(m);
    if (!d) continue;
    if (copyDates.length && copyDates[0] <= d.value) continue;
    return { m, t, d, strength: (laterCopy || d.imageBound ? "strong" : "medium") as Strength };
  }
  return null;
}

/** 맥락 조작 (v3): the trusted page shows this same picture, dated ≥30 days before the claimed date. */
function trustedContext(matches: SourceMatch[], trusted: TrustedSourceList, claimedDate: string | null) {
  if (!claimedDate) return null;
  for (const m of [...matches].sort((a, b) => (a.firstSeenAt ?? "9999").localeCompare(b.firstSeenAt ?? "9999"))) {
    const t = findTrustedSource(m.url, trusted);
    if (!t || !sameImage(m)) continue;
    const d = pageDate(m);
    if (!d) continue;
    const gap = daysBetween(d.value, claimedDate);
    if (gap < TRUSTED_RULES.contextMinDays) continue;
    return { m, t, d, gap, strength: (d.imageBound ? "strong" : "medium") as Strength };
  }
  return null;
}

export function decideVerdict(input: VerdictInput): VerdictResult {
  const { evidence, matches, claimedDate, claimText } = input;
  const trusted = input.trustedSources ?? EMPTY_TRUSTED_LIST;
  const headline = headlineFinding(evidence, matches, trusted);
  const done = (verdict: Verdict, reason: string, rule: string, strength: Strength | null, missing: string[] = []): VerdictResult =>
    ({ verdict, reason, missing, rule, strength, headlineFinding: headline });

  // ---- v2 rules with the shared comparison ambiguity guard ----
  const provenance = evidence.filter(e => e.kind === "c2pa" && strong(e) && e.details.signatureValid === true);
  const capture = provenance.some(e => real(e) && e.details.action === "camera_capture" && e.details.noEdits === true);
  const generated = provenance.some(e => manip(e) && e.details.action === "ai_generated") || evidence.some(e =>
    e.kind === "watermark" && strong(e) && manip(e) && e.details.verified === true);
  const edited = provenance.some(e => manip(e) && e.details.action === "ai_edited");
  const missing: string[] = [];
  if (Number(capture) + Number(generated) + Number(edited) > 1) {
    return done("inconclusive", "강한 출처 기록들이 서로 충돌해요. 추가 검증이 필요해요.", "v2.provenance_conflict", null, ["출처 기록 간 모순이 해결되지 않았어요"]);
  }
  if (generated) return done("ai_generated", "검증된 출처 기록이나 워터마크가 AI 생성을 가리켜요.", "v2.ai_generated", "strong");
  // Shared by v2 and v3: a scene match is not proof that the file is derived from that photo.
  // A separately qualifying candidate can still establish the edit; a rejected candidate cannot.
  if (ambiguousComparison(matches)) return done("inconclusive", "차이 영역 밖의 잔차·영역 면적·개수 조건을 충족하지 못해 편집으로 단정할 수 없어요.",
    "comparison.possible_different_photo", null, ["같은 사진을 편집한 것인지, 같은 장소에서 따로 찍은 사진인지 확인하지 못했어요"]);
  if (edited) return done("edited", "검증된 출처 기록에 AI 편집 이력이 있어요. 차이 영역은 보조 근거예요.", "v2.ai_edited", "strong");
  // Same picture = under 2% changed AND no differing region (a small edit can stay under 2%; see sameImage above).
  const checked = matches.filter(sameImage);
  const fact = evidence.find(e => e.kind === "fact_check" && strong(e) && manip(e) &&
    e.details.claimMatched === true && e.details.imageMatched === true && e.details.pageVerified === true && e.details.assessment === "miscontextualized");
  if (fact) return done("miscontextualized", "같은 이미지·같은 주장에 대해, 확인한 팩트체크 원문이 맥락 불일치를 설명해요.", "v2.fact_check", "strong");
  // Page publication dates alone do not prove when the current image first appeared (v2). v3 relaxes this for trusted sources below.
  const dated = checked.filter(m => !m.dateDisputed).flatMap(m => m.dates ?? []).find(d =>
    d.imageBound && d.confidence === "medium" && claimedDate && d.value.slice(0, 10) < claimedDate);
  if (dated) return done("miscontextualized", `이 이미지가 ${dated.value.slice(0, 10)}에 이미 있었다는 기록이 있어, 알려준 촬영 날짜와 맞지 않아요. (${DATE_SOURCE_LABEL[dated.source]})`, "v2.image_bound_date", "strong");

  // ---- v3: trusted-source rules (only when a trusted list is supplied) ----
  const te = trusted.sources.length ? trustedEdited(matches, trusted) : null;
  if (te && capture) {
    return done("inconclusive", "서명된 촬영 기록과 신뢰 출처 사진의 차이가 서로 맞지 않아요. 추가 검증이 필요해요.", "v3.capture_vs_trusted_conflict", null,
      ["출처 기록과 신뢰 출처 비교 결과가 충돌해요"]);
  }
  if (te) {
    const n = te.m.comparison!.diffRegions.length;
    return done("edited",
      `신뢰 출처 원본과 달라요: ${te.t.name}에 ${te.d.value} ${DATE_WORD[te.d.source]}된 사진과 비교하면 ${describeRegions(te.m.comparison!.diffRegions)}${n > 1 ? ` 등 ${n}군데가` : " 영역이"} 달라요. 누가 왜 바꿨는지는 판단하지 않아요.`,
      "v3.trusted_edited", te.strength);
  }
  const tc = trusted.sources.length ? trustedContext(matches, trusted, claimedDate) : null;
  if (tc) {
    return done("miscontextualized",
      `신뢰 출처(${tc.t.name}) 페이지에 같은 사진이 ${tc.d.value} ${DATE_WORD[tc.d.source]} 날짜로 있어요. 알려준 날짜(${claimedDate})보다 ${formatGap(tc.gap)} 일러서 맞지 않아요.`,
      "v3.trusted_context", tc.strength);
  }

  // ---- v2 tail, unchanged ----
  const uncertainContext = evidence.some(e => e.kind === "context" && (manip(e) || e.outcome === "unavailable"));
  const pixelDifferences = matches.some(m => m.comparison?.matched && m.comparison.diffRegions.length);
  if (capture && !uncertainContext && !pixelDifferences && !claimedDate && !claimText) {
    return done("authentic", "서명된 카메라 촬영·무편집 기록을 확인했어요. 사진 속 사건에 대한 모든 주장을 보증하는 것은 아니에요.", "v2.authentic", "strong");
  }
  if (!matches.length) missing.push("같은 사진의 다른 기록이 없어요");
  else if (!checked.length) missing.push("찾은 사진이 넣은 이미지와 충분히 같지 않아요");
  if (!provenance.length) missing.push("파일에 출처 기록(C2PA)이 없어요");
  if (matches.length && !matches.some(m => m.firstSeenAt)) missing.push("날짜를 확인하지 못했어요");
  if (uncertainContext) missing.push("맥락 관찰을 뒷받침할 독립적인 근거가 더 필요해요");
  if (pixelDifferences) missing.push("차이의 원인과 편집 이력을 확인하지 못했어요");
  // v3 hints: say what would have let a trusted-source rule decide.
  if (trusted.sources.length) {
    const trustedSame = matches.filter((m) => findTrustedSource(m.url, trusted) && sameImage(m));
    if (trustedSame.length && !claimedDate) missing.push("알려준 촬영 날짜가 없어 신뢰 출처 게시일과 비교하지 못했어요");
    else if (trustedSame.some((m) => pageDate(m)) && claimedDate) missing.push(`신뢰 출처 게시일이 알려준 날짜보다 ${TRUSTED_RULES.contextMinDays}일 이상 이르지 않아요`);
    if (matches.some((m) => findTrustedSource(m.url, trusted) && (m.dateDisputed || (aligned(m) && !pageDate(m))))) missing.push("신뢰 출처 페이지의 게시일을 확정하지 못했어요");
    if (trustedSame.length && matches.some((m) => findTrustedSource(m.url, trusted) && localDifference(m))) missing.push("신뢰 출처 두 곳의 사진이 서로 달라요");
  }
  return done("inconclusive", "결론을 내릴 만큼 강한 근거가 없어요.", "none", null, [...new Set(missing)]);
}

// Strongest first; ties broken by kind order (원본 일치 → C2PA → 워터마크 → 팩트체크 → EXIF → AI 탐지 → 화면 재촬영).
export function sortEvidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort(
    (a, b) =>
      STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
}
