// Markdown report for the evaluation harness. Pure: results in, text out (tests/eval.test.ts).
// Order: 오판 first with every evidence card, then per-label stats, totals, v2→v3 changes, per-case table.
import { EVIDENCE_LABEL, type EvidenceKind, OUTCOME_LABEL as EVIDENCE_OUTCOME, type Outcome as EvidenceOutcome, STRENGTH_LABEL, type Strength, VERDICT_LABEL, type Verdict } from "../lib/domain";
import type { VerdictResult } from "../lib/verdict";
import { classify, LABELS, type Label, OUTCOME_LABEL, summarize, type Summary } from "./metrics";

export interface EvidenceRow {
  kind: EvidenceKind;
  outcome: EvidenceOutcome;
  strength: Strength;
  summary: string;
  sourceUrl: string | null;
  provider: string;
  score: number | null;
}

export interface MatchRow {
  url: string;
  trusted: string | null;
  date: string | null;
  dateSource: string | null;
  dateDisputed: boolean;
  alignment: number;
  alignedDistance: number;
  changedFraction: number;
  regions: number;
}

export interface CaseResult {
  id: string;
  label: Label;
  source: string;
  claim: string;
  claimedDate: string | null;
  error?: string;
  v2?: Pick<VerdictResult, "verdict" | "rule">;
  v3?: VerdictResult;
  evidence?: EvidenceRow[];
  candidates?: { verified: number; matched: number; trusted: number; searched: string[] };
  matches?: MatchRow[];
  warnings?: string[];
}

const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
const v = (x: Verdict | null | undefined) => (x ? VERDICT_LABEL[x] : "—");
const cell = (s: string) => s.replaceAll("|", "/").replaceAll("\n", " ");

function wrongCase(r: CaseResult, lines: string[]) {
  const d = r.v3!;
  lines.push(`### ${r.id} — 정답 ${v(r.label)} · 판정 ${v(d.verdict)}`, "");
  lines.push(`- 판정 이유: ${d.reason}`);
  lines.push(`- 규칙 · 강도: \`${d.rule}\` · ${d.strength ? STRENGTH_LABEL[d.strength] : "—"} (v2 판정: ${v(r.v2?.verdict)})`);
  lines.push(`- 핵심 발견: ${d.headlineFinding?.text ?? "—"}`);
  lines.push(`- 정답 출처: ${r.source || "—"}`);
  lines.push(`- 유포 주장: ${r.claim || "—"} · 주장한 날짜: ${r.claimedDate ?? "—"}`);
  lines.push("", "근거 카드 (강한 순):", "", "| 근거 | 결과 | 강도 | 요약 | 출처 | 제공자 |", "| --- | --- | --- | --- | --- | --- |");
  for (const e of r.evidence ?? []) {
    lines.push(`| ${EVIDENCE_LABEL[e.kind]} | ${EVIDENCE_OUTCOME[e.outcome]} | ${STRENGTH_LABEL[e.strength]} | ${cell(e.summary)} | ${e.sourceUrl ?? "—"} | ${e.provider} |`);
  }
  if (!r.evidence?.length) lines.push("| (근거 없음) | | | | | |");
  if (r.matches?.length) {
    lines.push("", "확인한 후보:", "", "| 페이지 | 신뢰 출처 | 날짜(출처) | 날짜 충돌 | 정렬 상관도 | 정렬 후 pHash | 변화 비율 | 차이 영역 |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const m of r.matches) {
      lines.push(`| ${m.url} | ${m.trusted ?? "—"} | ${m.date ?? "—"}${m.dateSource ? ` (${m.dateSource})` : ""} | ${m.dateDisputed ? "있음" : "없음"} | ${m.alignment} | ${m.alignedDistance} | ${m.changedFraction} | ${m.regions} |`);
    }
  }
  if (d.missing.length) lines.push("", `부족한 근거: ${d.missing.join(" · ")}`);
  if (r.warnings?.length) lines.push("", `경고: ${r.warnings.join(" · ")}`);
  lines.push("");
}

function labelTable(title: string, s: Summary, lines: string[]) {
  lines.push(`### ${title}`, "", "| 정답 라벨 | 사례 | 맞힘 | 맞힘률 | 판단 불가 | 판단 불가율 | 오판 | 실행 실패 |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const l of LABELS) {
    const b = s.byLabel[l];
    lines.push(`| ${VERDICT_LABEL[l]} | ${b.n} | ${b.correct} | ${pct(b.correctRate)} | ${b.missed} | ${pct(b.missedRate)} | ${b.wrong ? `**${b.wrong}**` : 0} | ${b.error} |`);
  }
  lines.push(`| **전체** | ${s.total} | ${s.outcomes.correct} | ${pct(s.ran ? s.outcomes.correct / s.ran : null)} | ${s.outcomes.missed} | ${pct(s.ran ? s.outcomes.missed / s.ran : null)} | ${s.outcomes.wrong ? `**${s.outcomes.wrong}**` : 0} | ${s.outcomes.error} |`, "");
}

export function buildReport(mode: string, listVersion: string, results: CaseResult[], when = new Date()) {
  const s2 = summarize(results.map((r) => ({ id: r.id, label: r.label, predicted: r.v2?.verdict ?? null })));
  const s3 = summarize(results.map((r) => ({ id: r.id, label: r.label, predicted: r.v3?.verdict ?? null })));
  const lines: string[] = [];
  lines.push(`# 평가 결과 (${when.toISOString().slice(0, 16).replace("T", " ")} UTC)`, "");
  if (mode === "mock") {
    lines.push("> **MOCK 모드입니다.** 역이미지 검색 키가 없어서 모의 공급자로 돌렸어요. 실제 사진은 모두 '원본 없음 → 판단 불가'가 되므로 정확도와 무관해요. 하네스가 동작하는지만 확인한 결과예요.", "");
  }
  lines.push(`- 모드: **${mode}** · 사례 ${s3.total}건 (실행 ${s3.ran}건, 실행 실패 ${s3.outcomes.error}건) · 신뢰 출처 목록 ${listVersion}`);
  lines.push(`- v3: 맞힘 ${s3.outcomes.correct} · 판단 불가 ${s3.outcomes.missed} · **오판 ${s3.outcomes.wrong}**`);
  lines.push("- 오판 = 정답과 다른 **확정** 판정 전부입니다. 조작 유형만 틀린 경우(예: 편집본을 맥락 조작으로 판정)도 오판입니다. 판단 불가는 오판이 아니라 놓침으로 셉니다.", "");

  lines.push(`## 오판 (v3, ${s3.outcomes.wrong}건)`, "");
  if (!s3.outcomes.wrong) lines.push("없음", "");
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const id of s3.byOutcome.wrong) wrongCase(byId.get(id)!, lines);

  lines.push("## 정답 라벨별 집계", "");
  labelTable("v3", s3, lines);
  labelTable("v2 (같은 근거, 신뢰 출처 규칙 없이)", s2, lines);

  const changed = results.filter((r) => r.v2 && r.v3 && r.v2.verdict !== r.v3.verdict);
  lines.push(`## v2 → v3에서 바뀐 사례 (${changed.length}건)`, "");
  if (changed.length) {
    lines.push("| 사례 | 정답 | v2 | v3 | 규칙 · 강도 | v2 결과 → v3 결과 |", "| --- | --- | --- | --- | --- | --- |");
    for (const r of changed) {
      lines.push(`| ${r.id} | ${v(r.label)} | ${v(r.v2!.verdict)} | ${v(r.v3!.verdict)} | \`${r.v3!.rule}\` · ${r.v3!.strength ? STRENGTH_LABEL[r.v3!.strength] : "—"} | ${OUTCOME_LABEL[classify(r.label, r.v2!.verdict)]} → ${OUTCOME_LABEL[classify(r.label, r.v3!.verdict)]} |`);
    }
  } else lines.push("없음");
  lines.push("");

  lines.push("## 사례별 요약", "", "| 사례 | 정답 | v3 판정 | 결과 | 강도 | 후보(확인/일치/신뢰) | 핵심 발견 · 부족한 근거 | 경고·오류 |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    const o = OUTCOME_LABEL[classify(r.label, r.v3?.verdict ?? null)];
    const cand = r.candidates ? `${r.candidates.verified}/${r.candidates.matched}/${r.candidates.trusted}` : "—";
    const detail = r.v3 ? [r.v3.headlineFinding?.text, ...r.v3.missing].filter(Boolean).join(" · ") : "—";
    lines.push(`| ${r.id} | ${v(r.label)} | ${v(r.v3?.verdict)} | ${o} | ${r.v3?.strength ? STRENGTH_LABEL[r.v3.strength] : "—"} | ${cand} | ${cell(detail)} | ${cell(r.error ?? (r.warnings ?? []).join(" · "))} |`);
  }
  lines.push("", "혼동 행렬(행=정답, 열=판정)은 results.json의 `summary.v3.confusion`에 있어요.");
  return { markdown: lines.join("\n") + "\n", s2, s3 };
}
