// Verdict rules v1 (architecture.md, "판정 규칙 v1"). Pure function, no I/O.
// The pixel model never decides a verdict on its own: it is always weak evidence.
import {
  DATE_SOURCE_LABEL,
  type Evidence,
  KIND_ORDER,
  type SourceMatch,
  STRENGTH_RANK,
  type Verdict,
} from "./domain";

export const PIPELINE_VERSION = 1;
const IDENTICAL = 0.98;

export interface VerdictInput {
  evidence: Evidence[];
  matches: SourceMatch[];
  claimedDate: string | null; // YYYY-MM-DD
}

export interface VerdictResult {
  verdict: Verdict;
  reason: string;
  missing: string[]; // what we could not establish, shown on the 판단 불가 screen
}

const strong = (e: Evidence) => e.strength === "strong";
const manip = (e: Evidence) => e.outcome === "supports_manipulated";
const real = (e: Evidence) => e.outcome === "supports_real";

export function decideVerdict({ evidence, matches, claimedDate }: VerdictInput): VerdictResult {
  const by = (k: Evidence["kind"]) => evidence.filter((e) => e.kind === k);
  const c2pa = by("c2pa")[0];
  const watermark = by("watermark")[0];
  const factCheck = by("fact_check")[0];
  const earliest = matches.find((m) => m.isEarliest) ?? null;
  const missing: string[] = [];

  // 1. AI 생성: signed provenance says AI-generated, or a known watermark at high confidence.
  if (c2pa && strong(c2pa) && manip(c2pa) && c2pa.details.action === "ai_generated") {
    return { verdict: "ai_generated", reason: "파일의 출처 기록(C2PA)에 AI 생성 도구가 적혀 있어요.", missing };
  }
  if (watermark && strong(watermark) && manip(watermark)) {
    const tool = typeof watermark.details.tool === "string" ? ` (${watermark.details.tool})` : "";
    return { verdict: "ai_generated", reason: `AI 생성 도구의 워터마크가 검출됐어요${tool}.`, missing };
  }

  // 2. 편집 조작: an earlier original exists and differs in meaningful regions, or C2PA records an AI edit.
  if (earliest && earliest.similarity < IDENTICAL && earliest.diffRegions.length > 0) {
    return {
      verdict: "edited",
      reason: `원본을 찾았어요. 원본에서 달라진 곳이 ${earliest.diffRegions.length}군데 있어요.`,
      missing,
    };
  }
  if (c2pa && strong(c2pa) && manip(c2pa) && c2pa.details.action === "ai_edited") {
    return { verdict: "edited", reason: "파일의 출처 기록(C2PA)에 AI 편집 기록이 있어요.", missing };
  }

  // 3. 맥락 조작: the picture is the same as an earlier one, and either a fact-checker already ruled on it
  //    or it existed before the date the user was told. Without a date, we do not call it.
  const identicalEarliest = earliest && earliest.similarity >= IDENTICAL ? earliest : null;
  if (identicalEarliest) {
    if (factCheck && strong(factCheck) && manip(factCheck)) {
      return {
        verdict: "miscontextualized",
        reason: "팩트체크 기관이 이 사진을 다른 사건의 사진으로 확인했어요.",
        missing,
      };
    }
    if (identicalEarliest.firstSeenAt && claimedDate && identicalEarliest.firstSeenAt.slice(0, 10) < claimedDate) {
      const src = identicalEarliest.firstSeenSource ? DATE_SOURCE_LABEL[identicalEarliest.firstSeenSource] : "";
      return {
        verdict: "miscontextualized",
        reason: `이 사진은 ${identicalEarliest.firstSeenAt.slice(0, 10)} 이전에 이미 있었어요. (${src})`,
        missing,
      };
    }
  }

  // 4. 진짜 확인: no strong evidence of manipulation, and either signed camera provenance or an identical earlier copy.
  const anyStrongManip = evidence.some((e) => strong(e) && manip(e));
  if (!anyStrongManip) {
    if (c2pa && strong(c2pa) && real(c2pa)) {
      return { verdict: "authentic", reason: "카메라에서 서명된 촬영 기록이 있고, 편집 기록은 없어요.", missing };
    }
    // An identical earlier copy with a known date, and no claimed date it contradicts.
    // (A contradicting date was already handled as 맥락 조작 above.) Without a date we stay 판단 불가.
    if (identicalEarliest?.firstSeenAt) {
      return { verdict: "authentic", reason: "같은 사진의 이른 기록을 찾았어요. 달라진 곳은 없어요.", missing };
    }
  }

  // 5. 판단 불가: say what is missing.
  if (matches.length === 0) missing.push("같은 사진의 다른 기록이 없어요");
  else if (!identicalEarliest && !(earliest && earliest.diffRegions.length > 0)) missing.push("찾은 사진이 넣은 이미지와 충분히 같지 않아요");
  if (!c2pa || c2pa.outcome === "unavailable" || c2pa.outcome === "neutral") missing.push("파일에 출처 기록(C2PA)이 없어요");
  if (matches.length > 0 && !matches.some((m) => m.firstSeenAt)) missing.push("날짜를 확인하지 못했어요");
  if (identicalEarliest && !identicalEarliest.firstSeenAt) missing.push("날짜를 확인하지 못했어요");
  return { verdict: "inconclusive", reason: "결론을 내릴 만큼 강한 근거가 없어요.", missing: [...new Set(missing)] };
}

// Strongest first; ties broken by kind order (원본 일치 → C2PA → 워터마크 → 팩트체크 → EXIF → AI 탐지 → 화면 재촬영).
export function sortEvidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort(
    (a, b) =>
      STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
}
