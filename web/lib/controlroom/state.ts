// Control room view of a hearing: what the Claw3D custom runtime adapter serves (replica/controlroom.md).
// Built only from CourtEvents, i.e. from statements that passed court validation. Read-only by construction:
// nothing here can reach the verdict, the court, or any agent configuration.
import type { CourtEvent, Seat, SeatStatus } from "../court/court";

export const SEATS: { id: Seat; name: string; role: string }[] = [
  { id: "judge", name: "판사 (규칙 v3, 코드)", role: "judge" },
  { id: "prosecutor", name: "검사", role: "prosecutor" },
  { id: "defense", name: "변호인", role: "defense" },
  { id: "juror-1", name: "배심원 1 (사진 기술)", role: "juror" },
  { id: "juror-2", name: "배심원 2 (날짜·맥락)", role: "juror" },
  { id: "juror-3", name: "배심원 3 (출처 신뢰)", role: "juror" },
  { id: "clerk", name: "서기", role: "clerk" },
];
export const STATUS_LABEL: Record<SeatStatus, string> = { idle: "대기", working: "작업 중", speaking: "발언" };

export interface SeatView {
  id: Seat;
  name: string;
  status: SeatStatus;
  summary: string | null; // latest accepted statement
  cite: string[];
  rejected: number; // statements discarded by the court rules so far
  updatedAt: string | null;
}

export interface ControlRoomState {
  caseId: string | null;
  phase: "idle" | "hearing" | "done";
  model: string | null;
  seats: Record<Seat, SeatView>;
  timeline: CourtEvent[]; // last 100 events
}

export function emptyState(model: string | null = null): ControlRoomState {
  return {
    caseId: null, phase: "idle", model,
    seats: Object.fromEntries(SEATS.map((s): [Seat, SeatView] => [s.id, { id: s.id, name: s.name, status: "idle", summary: null, cite: [], rejected: 0, updatedAt: null }])) as Record<Seat, SeatView>,
    timeline: [],
  };
}

/** Pure reducer: a new state per event. Summaries persist while a seat goes back to idle. */
export function applyEvent(state: ControlRoomState, e: CourtEvent): ControlRoomState {
  const prev = state.seats[e.seat];
  const seat: SeatView = {
    ...prev,
    status: e.status,
    summary: e.summary ?? prev.summary,
    cite: e.status === "speaking" ? e.cite : prev.cite,
    rejected: prev.rejected + e.rejected,
    updatedAt: e.at,
  };
  const done = e.seat === "clerk" && e.status === "idle" || (e.seat === "judge" && e.status === "idle" && !!e.summary);
  return {
    ...state,
    phase: done ? "done" : "hearing",
    seats: { ...state.seats, [e.seat]: seat },
    timeline: [...state.timeline, e].slice(-100),
  };
}

/** One seat as plain text, for the Claw3D chat panel. */
export function describeSeat(state: ControlRoomState, id: Seat): string {
  const s = state.seats[id];
  const lines = [
    `[${s.name}] 상태: ${STATUS_LABEL[s.status]}`,
    s.summary ? `요약: ${s.summary}` : "요약: 아직 발언 없음",
    `인용 근거 카드: ${s.cite.length ? s.cite.join(", ") : "없음"}`,
  ];
  if (s.rejected) lines.push(`규칙에 따라 폐기된 주장: ${s.rejected}건`);
  return lines.join("\n");
}
