// "Fact-check court" on top of the verdict rules (replica/newsroom-court.md).
// Judge = decideVerdict (code). Agents only argue, and code enforces the rules on every answer:
//   - a statement without a valid evidence-card citation is discarded;
//   - jurors can only uphold, or lower the verdict to 판단 불가 with a cited, relevant doubt;
//   - nobody can raise or change the verdict; the final verdict is the judge's or 판단 불가;
//   - a 판단 불가 from the judge opens no hearing (no LLM calls).
import { VERDICT_LABEL, type Evidence, type SourceMatch, type Verdict } from "../domain";
import type { AgentRole, LLMProvider } from "../llm/types";
import { LLMUnavailable, maskLLMSecrets, type LLMFailure } from "../llm/errors";
import type { VerdictResult } from "../verdict";
import { LOCAL_EDIT_LIMITS } from "../verification/edit-locality";
import { buildDocket, renderCaseFile, type Card, type Docket } from "./docket";
import { DEFENSE_KINDS, DOUBT_KINDS, DOUBT_LABEL, JUROR_PERSPECTIVES, SCHEMA, SYSTEM, type DefenseKind, type DoubtKind } from "./prompts";

export interface Statement { text: string; cite: string[] }
export interface Argument extends Statement { id: string }
export interface Alternative extends Argument { kind: DefenseKind }
export interface Rejection { role: string; text: string; reason: string }
export interface JurorResult {
  juror: number; // 1..3
  perspective: string;
  decision: "uphold" | "inconclusive";
  doubt: (Statement & { kind: DoubtKind; adopts: string | null }) | null;
}
export interface Judgment {
  verdict: Verdict;
  verdictLabel: string;
  headline: string; // written by code, never by the clerk
  keyEvidence: string[];
  prosecution: Statement | null;
  defense: Statement | null;
  remainingDoubts: Statement[];
  howToCheck: string[]; // written by code
  clerkWritten: boolean;
}
export interface CourtRecord {
  opened: boolean;
  skipReason: string | null;
  judgeVerdict: Verdict;
  finalVerdict: Verdict;
  downgraded: boolean;
  docket: Docket;
  prosecution: Argument[];
  defense: Alternative[];
  jurors: JurorResult[];
  rejected: Rejection[];
  incomplete: string[]; // roles whose answer could not be used at all (error, not JSON)
  judgment: Judgment;
  llmCalls: number;
  llmMs: number;
  reviewStatus: "complete" | "skipped" | "unavailable";
  failureCode: LLMFailure | null;
}

/** Which doubts can lower which verdict. Anything else is not a reasonable doubt about that verdict. */
export const DOUBTS_FOR: Record<Exclude<Verdict, "inconclusive">, DoubtKind[]> = {
  edited: ["same_place_different_time", "crop_recompress", "date_error"],
  miscontextualized: ["date_error", "different_event", "same_place_different_time"],
  ai_generated: ["provenance_doubt"],
  authentic: ["possible_manipulation"],
};

/**
 * A doubt must cite at least one card whose *measured facts* show a signal for it. A card of the right type is
 * not enough: with qwen2.5:1.5b all three jurors adopted "차이가 있으니 날짜 오류" citing a page whose date was
 * undisputed, and a correct 편집 조작 fell to 판단 불가. Edit verdicts already passed the locality guard, so the
 * temporal signals look for comparisons close to its limits.
 */
const near = (v: unknown, limit: number) => typeof v === "number" && v >= limit / 2;
export const DOUBT_SIGNAL: Record<DefenseKind, { label: string; test: (c: Card) => boolean }> = {
  same_place_different_time: {
    label: "색 보정, 영역 밖 잔차·차이 면적이 한도의 절반 이상, 차이 영역 2곳 이상, 또는 장면 유사도 0.9 미만",
    test: (c) => ["source_page", "image_comparison", "source_match"].includes(c.kind) && (c.facts.colorAdjusted === true ||
      near(c.facts.outsideResidual, LOCAL_EDIT_LIMITS.maxOutsideResidual) || near(c.facts.diffAreaFraction, LOCAL_EDIT_LIMITS.maxDiffAreaFraction) ||
      (typeof c.facts.diffRegions === "number" && c.facts.diffRegions >= 2) || (typeof c.facts.sceneSimilarity === "number" && c.facts.sceneSimilarity < 0.9)),
  },
  crop_recompress: {
    label: "잘라내기·반전·색 보정이 관찰되었거나 정렬 점수 0.95 미만",
    test: (c) => ["source_page", "image_comparison", "source_match"].includes(c.kind) && (c.facts.cropped === true || (c.facts.flip !== null && c.facts.flip !== undefined) ||
      c.facts.colorAdjusted === true || (typeof c.facts.alignmentScore === "number" && c.facts.alignmentScore < 0.95)),
  },
  date_error: {
    label: "날짜 다툼이 기록되었거나 날짜 출처가 검색 발견일뿐임, 또는 맥락·팩트체크 카드",
    test: (c) => c.facts.dateDisputed === true || c.facts.dateSource === "search_discovered" || ["context", "fact_check"].includes(c.kind),
  },
  different_event: { label: "맥락 또는 팩트체크 카드", test: (c) => ["context", "fact_check"].includes(c.kind) },
  provenance_doubt: { label: "강하지 않은 C2PA·워터마크 카드", test: (c) => ["c2pa", "watermark"].includes(c.kind) && c.strength !== "strong" },
  possible_manipulation: { label: "약하지 않은 조작 쪽 근거 카드", test: (c) => c.outcome === "supports_manipulated" && c.strength !== "weak" },
  other: { label: "—", test: () => true },
};

const MAX_TEXT = 300;
/** Agent text is shown to people: no control characters, no links (cards carry the only URLs), bounded length. */
export function sanitize(text: unknown): string {
  if (typeof text !== "string") return "";
  return maskLLMSecrets(text)
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[링크 삭제]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

type Checked = { ok: true; value: Statement } | { ok: false; reason: string };
function checkStatement(raw: unknown, docket: Docket): Checked {
  const o = (raw ?? {}) as { text?: unknown; cite?: unknown };
  const text = sanitize(o.text);
  if (!text) return { ok: false, reason: "내용 없음" };
  const cite = Array.isArray(o.cite) ? [...new Set(o.cite.filter((c): c is string => typeof c === "string").map((c) => c.trim()))] : [];
  if (!cite.length) return { ok: false, reason: "근거 카드 인용 없음" };
  const unknown = cite.filter((id) => !docket.cards.some((c) => c.id === id));
  if (unknown.length) return { ok: false, reason: `없는 근거 카드 인용: ${unknown.join(", ")}` };
  return { ok: true, value: { text, cite } };
}

const relevant = (kind: DefenseKind, cite: string[], docket: Docket) =>
  cite.some((id) => { const c = docket.cards.find((x) => x.id === id); return !!c && DOUBT_SIGNAL[kind].test(c); });
const noSignal = (kind: DefenseKind) => `인용한 카드에 '${DOUBT_LABEL[kind]}'을 뒷받침하는 측정값이 없음 (필요: ${DOUBT_SIGNAL[kind].label})`;
/** 으로/로: "편집 조작으로", "AI 생성으로"; ㄹ받침과 받침 없는 말은 "로". */
export function euro(word: string) {
  const ch = [...word].reverse().find((c) => /[가-힣]/.test(c)) ?? "";
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const jong = code % 28;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

/** Seats in the hearing, for observers (the control room). */
export type Seat = "judge" | "prosecutor" | "defense" | "juror-1" | "juror-2" | "juror-3" | "clerk";
export type SeatStatus = "idle" | "working" | "speaking";
/**
 * What an observer may see: who is thinking or speaking, a summary of what *passed validation*, and the cards it
 * cites. Rejected statements appear only as a count and reasons, never as accepted speech.
 */
export interface CourtEvent {
  seq: number;
  at: string;
  seat: Seat;
  status: SeatStatus;
  summary: string | null;
  cite: string[];
  rejected: number;
}
export interface CourtOptions { onEvent?: (e: CourtEvent) => void }

export interface CourtInput {
  verdict: VerdictResult;
  evidence: Evidence[];
  matches: SourceMatch[];
}

export async function runCourt(input: CourtInput, llm: LLMProvider, signal: AbortSignal, options: CourtOptions = {}): Promise<CourtRecord> {
  const docket = buildDocket(input.verdict, input.evidence, input.matches);
  const judge = input.verdict.verdict;
  let seq = 0;
  const emit = (seat: Seat, status: SeatStatus, summary: string | null = null, cite: string[] = [], rejected = 0) =>
    options.onEvent?.({ seq: ++seq, at: new Date().toISOString(), seat, status, summary, cite, rejected });
  const cardsOf = (xs: { cite: string[] }[]) => [...new Set(xs.flatMap((x) => x.cite))];
  const record: CourtRecord = {
    opened: judge !== "inconclusive", skipReason: null, judgeVerdict: judge, finalVerdict: judge, downgraded: false, docket,
    prosecution: [], defense: [], jurors: [], rejected: [], incomplete: [], judgment: null as unknown as Judgment, llmCalls: 0, llmMs: 0,
    reviewStatus: judge === "inconclusive" ? "skipped" : "complete", failureCode: null,
  };
  emit("judge", "speaking", `규칙 v3 판정: ${VERDICT_LABEL[judge]}. ${sanitize(input.verdict.reason)}`, [], 0);
  if (judge === "inconclusive") {
    record.skipReason = "판사가 이미 판단 불가를 냈어요. 공방을 열지 않아요.";
    record.judgment = writeJudgment(record, null);
    emit("judge", "idle", record.skipReason);
    return record;
  }
  emit("judge", "idle");

  const unavailable = (seat: Seat): CourtRecord => {
    record.reviewStatus = "unavailable";
    record.finalVerdict = "inconclusive";
    record.downgraded = true;
    record.skipReason = "맥락·법정 확인 못 함";
    record.judgment = writeJudgment(record, null);
    emit(seat, "idle", record.skipReason);
    emit("judge", "speaking", record.skipReason);
    emit("judge", "idle");
    return record;
  };

  const ask = async (role: AgentRole, system: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> => {
    record.llmCalls++;
    const started = performance.now();
    try {
      const res = await llm.generate({ role, system, prompt: renderCaseFile(docket, extra), schema: SCHEMA[role] }, signal);
      const parsed = JSON.parse(res.text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        record.llmMs += res.stats.totalMs;
        return parsed as Record<string, unknown>;
      }
      throw new Error("not an object");
    } catch (e) {
      if (e instanceof LLMUnavailable) {
        record.failureCode = e.code;
        if (!e.requestSent) record.llmCalls--;
      } else if (llm.name.startsWith("gemini:")) record.failureCode = "invalid_response";
      record.llmMs += Math.round(performance.now() - started);
      signal.throwIfAborted();
      record.incomplete.push(role);
      return null;
    }
  };

  // Prosecutor: the case for "fake", from cards only.
  emit("prosecutor", "working");
  const p = await ask("prosecutor", SYSTEM.prosecutor);
  if (record.failureCode) return unavailable("prosecutor");
  const rejectedBefore = () => record.rejected.length;
  let mark = rejectedBefore();
  for (const raw of (Array.isArray(p?.claims) ? p.claims : []).slice(0, 4)) {
    const c = checkStatement(raw, docket);
    if (c.ok) record.prosecution.push({ id: `P${record.prosecution.length + 1}`, ...c.value });
    else record.rejected.push({ role: "검사", text: sanitize((raw as { text?: unknown })?.text), reason: c.reason });
  }

  emit("prosecutor", "speaking", record.prosecution.map((a) => `${a.id} ${a.text}`).join(" / ") || "인용 근거가 있는 주장 없음", cardsOf(record.prosecution), rejectedBefore() - mark);
  emit("prosecutor", "idle");

  // Defense: alternative explanations, each tied to cards that can carry it.
  emit("defense", "working");
  mark = rejectedBefore();
  const d = await ask("defense", SYSTEM.defense);
  if (record.failureCode) return unavailable("defense");
  for (const raw of (Array.isArray(d?.alternatives) ? d.alternatives : []).slice(0, 4)) {
    const kind = (raw as { kind?: unknown })?.kind as DefenseKind;
    const c = checkStatement(raw, docket);
    if (!c.ok) { record.rejected.push({ role: "변호인", text: sanitize((raw as { text?: unknown })?.text), reason: c.reason }); continue; }
    if (!DEFENSE_KINDS.includes(kind)) { record.rejected.push({ role: "변호인", text: c.value.text, reason: "알 수 없는 대안 종류" }); continue; }
    // The defense argues *against* the judge's verdict; with qwen2.5:7b it once filed "possible_manipulation"
    // (an argument for 편집 조작) as its alternative. Only doubts that can lower this verdict, or "other", count.
    if (kind !== "other" && !DOUBTS_FOR[judge as Exclude<Verdict, "inconclusive">].includes(kind as DoubtKind)) {
      record.rejected.push({ role: "변호인", text: c.value.text, reason: `'${VERDICT_LABEL[judge]}' 판정에 대한 대안 설명이 아님(${DOUBT_LABEL[kind]})` });
      continue;
    }
    if (!relevant(kind, c.value.cite, docket)) { record.rejected.push({ role: "변호인", text: c.value.text, reason: noSignal(kind) }); continue; }
    record.defense.push({ id: `D${record.defense.length + 1}`, kind, ...c.value });
  }

  emit("defense", "speaking", record.defense.map((a) => `${a.id} ${DOUBT_LABEL[a.kind]}: ${a.text}`).join(" / ") || "인용 근거가 있는 대안 없음", cardsOf(record.defense), rejectedBefore() - mark);
  emit("defense", "idle");

  // Jurors: three perspectives, each may only uphold or lower to 판단 불가 with a cited, relevant doubt.
  const allowed = DOUBTS_FOR[judge];
  for (const [i, perspective] of JUROR_PERSPECTIVES.entries()) {
    const role = `배심원 ${i + 1}`;
    const seat = `juror-${i + 1}` as Seat;
    emit(seat, "working");
    mark = rejectedBefore();
    try {
    const j = await ask("juror", `${SYSTEM.juror}\n${perspective}`, { arguments: { prosecution: record.prosecution, defense: record.defense } });
    if (record.failureCode) return unavailable(seat);
    const result: JurorResult = { juror: i + 1, perspective, decision: "uphold", doubt: null };
    record.jurors.push(result);
    if (!j) continue;
    const decision = j.decision;
    if (decision === "uphold" || decision === undefined) continue;
    if (decision !== "inconclusive") {
      record.rejected.push({ role, text: sanitize(String(decision)), reason: "배심원은 판정을 올리거나 다른 판정으로 바꿀 수 없어요. 유지로 처리했어요." });
      continue;
    }
    const raw = j.doubt as { kind?: unknown; adopts?: unknown } | null | undefined;
    const c = checkStatement(raw, docket);
    const kind = raw?.kind as DoubtKind;
    const reason = !c.ok ? c.reason
      : !DOUBT_KINDS.includes(kind) ? "알 수 없는 의심 종류"
      : !allowed.includes(kind) ? `'${VERDICT_LABEL[judge]}' 판정과 관계없는 의심(${DOUBT_LABEL[kind]})`
      : !relevant(kind, c.value.cite, docket) ? noSignal(kind)
      : null;
    if (reason || !c.ok) {
      record.rejected.push({ role, text: sanitize(raw && (raw as { text?: unknown }).text), reason: `합리적 의심으로 인정하지 않음: ${reason}. 유지로 처리했어요.` });
      continue;
    }
    const adopts = typeof raw?.adopts === "string" && record.defense.some((a) => a.id === raw.adopts) ? raw.adopts : null;
    result.decision = "inconclusive";
    result.doubt = { ...c.value, kind, adopts };
    } finally {
      const r = record.jurors[i];
      if (r) {
        emit(seat, "speaking", r.doubt ? `판단 불가로 낮춤 · ${DOUBT_LABEL[r.doubt.kind]}: ${r.doubt.text}` : "판정 유지", r.doubt?.cite ?? [], rejectedBefore() - mark);
        emit(seat, "idle");
      }
    }
  }

  // Beyond reasonable doubt: one juror's cited, relevant doubt is enough to withhold a decisive verdict.
  record.downgraded = record.jurors.some((j) => j.decision === "inconclusive");
  record.finalVerdict = record.downgraded ? "inconclusive" : judge;

  emit("clerk", "working");
  const k = await ask("clerk", SYSTEM.clerk, {
    finalVerdict: record.finalVerdict,
    arguments: { prosecution: record.prosecution, defense: record.defense },
    jurorDoubts: record.jurors.flatMap((j) => (j.doubt ? [j.doubt] : [])),
  });
  if (record.failureCode) return unavailable("clerk");
  mark = rejectedBefore();
  record.judgment = writeJudgment(record, k);
  emit("clerk", "speaking", record.judgment.headline, record.judgment.keyEvidence, rejectedBefore() - mark);
  emit("clerk", "idle");
  return record;
}

function writeJudgment(record: CourtRecord, clerk: Record<string, unknown> | null): Judgment {
  const { docket, judgeVerdict, finalVerdict } = record;
  const statement = (raw: unknown, role: string) => {
    if (raw === undefined || raw === null) return null;
    const c = checkStatement(raw, docket);
    if (!c.ok) { record.rejected.push({ role, text: sanitize((raw as { text?: unknown })?.text), reason: c.reason }); return null; }
    return c.value;
  };
  const summary = clerk ? statement(clerk.summary, "서기") : null;
  const prosecution = (clerk && statement(clerk.prosecution, "서기")) || record.prosecution[0] || null;
  const defense = (clerk && statement(clerk.defense, "서기")) || record.defense[0] || null;
  const clerkDoubts = clerk && Array.isArray(clerk.remainingDoubts) ? clerk.remainingDoubts.slice(0, 4).map((r) => statement(r, "서기")).filter((s): s is Statement => !!s) : [];
  const codeDoubts: Statement[] = [
    ...record.jurors.flatMap((j) => (j.doubt ? [{ text: `${DOUBT_LABEL[j.doubt.kind]}: ${j.doubt.text}`, cite: j.doubt.cite }] : [])),
    ...record.defense.filter((a) => !record.jurors.some((j) => j.doubt?.adopts === a.id)).map((a) => ({ text: `${DOUBT_LABEL[a.kind]}: ${a.text}`, cite: a.cite })),
  ];
  const decisive = docket.cards.filter((c) => c.kind === "source_page" || ((c.outcome === "supports_manipulated" || c.outcome === "supports_real") && c.strength !== "weak"));
  const headline = record.reviewStatus === "unavailable"
    ? "맥락·법정 확인 못 함. 재판을 완료하지 못해 최종 판단을 보류했어요."
    : !record.opened
    ? `판정: ${VERDICT_LABEL[judgeVerdict]}. 판사(규칙 v3)가 결론을 내리지 않아 공방을 열지 않았어요.`
    : record.downgraded
      ? `판정: ${VERDICT_LABEL[finalVerdict]}. 판사(규칙 v3)는 ${euro(`'${VERDICT_LABEL[judgeVerdict]}'`)} 판단했지만, 배심원이 근거 카드로 합리적 의심을 제기해 판단 불가로 낮췄어요.`
      : `판정: ${VERDICT_LABEL[finalVerdict]}. 판사(규칙 v3)의 판정을 배심원 3명이 유지했어요.`;
  return {
    verdict: finalVerdict,
    verdictLabel: VERDICT_LABEL[finalVerdict],
    headline,
    keyEvidence: summary?.cite ?? decisive.slice(0, 4).map((c) => c.id),
    prosecution,
    defense,
    remainingDoubts: clerkDoubts.length ? clerkDoubts : codeDoubts.slice(0, 4),
    howToCheck: howToCheck(docket),
    clerkWritten: !!summary,
  };
}

/** Steps a reader can take themselves. Code-written: they point at cards, they assert nothing new. */
function howToCheck(docket: Docket): string[] {
  const steps: string[] = [];
  for (const c of docket.cards.filter((x) => x.kind === "source_page").slice(0, 3)) {
    steps.push(`${c.id}: 후보 페이지를 직접 열어 사진과 게시일(${c.date ?? "날짜 미확인"})을 비교해 보세요.`);
  }
  if (docket.cards.some((c) => c.kind === "c2pa")) steps.push("원본 파일을 C2PA 검증 도구(Content Credentials)에 올려 서명과 편집 기록을 확인해 보세요.");
  if (docket.cards.some((c) => c.kind === "fact_check")) steps.push("인용된 팩트체크 기사를 열어 같은 사진, 같은 주장에 대한 판정인지 확인해 보세요.");
  steps.push("잘리거나 압축되지 않은 원본 파일이 있다면 그것으로 다시 검사해 보세요.");
  return steps;
}
