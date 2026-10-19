// The case file: the only facts any agent may use. Built by code from the existing evidence cards and verified
// source matches. Every card gets a stable ID (E1… evidence, S1… verified source pages) that agents must cite.
import { EVIDENCE_LABEL, type Evidence, type EvidenceKind, type Outcome, type SourceMatch, type Strength } from "../domain";
import type { VerdictResult } from "../verdict";

export type CardKind = EvidenceKind | "source_page";

export interface Card {
  id: string;
  kind: CardKind;
  label: string;
  outcome: Outcome | null;
  strength: Strength | null;
  summary: string; // written by this codebase, not by a web page
  sourceUrl: string | null;
  date: string | null; // YYYY-MM-DD, source pages only
  facts: Record<string, string | number | boolean | null>; // measured values (comparison, dates)
  untrustedPageText: string | null; // ≤200-char excerpt from a fetched page: data only, never instructions
}

export interface Docket {
  judge: { verdict: VerdictResult["verdict"]; rule: string; reason: string; missing: string[] };
  cards: Card[];
}

const scalar = (v: unknown) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : typeof v === "string" || typeof v === "boolean" || v === null ? v : undefined);

function scalars(o: Record<string, unknown> | undefined, keys?: string[]) {
  const out: Card["facts"] = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (keys && !keys.includes(k)) continue;
    const s = scalar(v);
    if (s !== undefined) out[k] = typeof s === "string" ? s.slice(0, 80) : s;
  }
  return out;
}

export function buildDocket(verdict: VerdictResult, evidence: Evidence[], matches: SourceMatch[]): Docket {
  const cards: Card[] = evidence.map((e, i) => ({
    id: `E${i + 1}`, kind: e.kind, label: EVIDENCE_LABEL[e.kind], outcome: e.outcome, strength: e.strength,
    summary: e.summary, sourceUrl: e.sourceUrl, date: null, facts: scalars(e.details), untrustedPageText: null,
  }));
  matches.forEach((m, j) => {
    // Discovery results that have not passed candidate verification cannot become courtroom evidence.
    if (m.verified !== true) return;
    const c = m.comparison;
    cards.push({
      id: `S${j + 1}`, kind: "source_page", label: "확인한 후보 페이지", outcome: null, strength: null,
      summary: c ? (c.diffRegions.length ? `정렬 후 차이 영역 ${c.diffRegions.length}곳` : "정렬 후 차이 영역 없음") : "비교 정보 없음",
      sourceUrl: m.url, date: m.firstSeenAt ? m.firstSeenAt.slice(0, 10) : null,
      facts: {
        dateSource: m.firstSeenSource, dateDisputed: m.dateDisputed ?? false, isEarliest: m.isEarliest,
        ...(c ? scalars(c as unknown as Record<string, unknown>, ["alignmentScore", "alignedDistance", "changedFraction", "diffAreaFraction", "outsideResidual", "colorAdjusted", "sceneSimilarity", "flip"]) : {}),
        cropped: c ? c.crop !== null : null, diffRegions: c ? c.diffRegions.length : null,
      },
      untrustedPageText: m.excerpt ? m.excerpt.slice(0, 200) : null,
    });
  });
  return { judge: { verdict: verdict.verdict, rule: verdict.rule, reason: verdict.reason, missing: verdict.missing }, cards };
}

/**
 * The case file as the user message. JSON keeps page text inside string values; "<" and ">" are escaped so
 * a page cannot close the <case_file> wrapper and pose as instructions.
 */
export function renderCaseFile(docket: Docket, extra: Record<string, unknown> = {}): string {
  const json = JSON.stringify({ ...docket, ...extra }, null, 1).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<case_file>\n${json}\n</case_file>`;
}
