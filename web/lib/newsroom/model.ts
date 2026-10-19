import type { Evidence, Verdict } from "../domain";
import type { ContentFlag, Channel, Topic, PublicCase } from "../public/types";

export const DEPARTMENTS = [
  { id: "monitoring", label: "모니터링", kind: "code", input: "접수 자료", output: "분류·중복 묶음", permission: "분류와 같은 접수의 식별만" },
  { id: "osint", label: "OSINT", kind: "code", input: "분류·입력/후보 URL", output: "후보·날짜·출처", permission: "요청한 페이지만 robots 준수 조회" },
  { id: "ai_data", label: "AI&데이터", kind: "code", input: "확인한 후보 이미지", output: "비교·히트맵·근거 카드", permission: "로컬 이미지 계산, 판정 권한 없음" },
  { id: "security", label: "보안&봇", kind: "code", input: "페이지 신호·접수 해시", output: "지시문·반복 제보 경고", permission: "내부 접수 검사만, SNS 수집 금지" },
  { id: "factcheck", label: "팩트체크 법정", kind: "code+llm", input: "근거 카드", output: "v3 판정·인용 공방", permission: "코드 판정, LLM은 유지/근거 있는 하향만" },
  { id: "legal", label: "법무", kind: "code", input: "판결문·주제·권리", output: "위험 경고", permission: "경고만, 게재/삭제 권한 없음" },
  { id: "trust_safety", label: "T&S", kind: "human", input: "근거·공방·위험", output: "사람 승인 기록", permission: "로그인한 운영자의 게재/반려/철회" },
  { id: "communications", label: "홍보&리포팅", kind: "code", input: "승인된 판결문", output: "공개 카드 초안", permission: "승인한 사실 문장만, SNS 발신 없음" },
  { id: "literacy", label: "미디어 리터러시", kind: "code", input: "승인 카드·근거", output: "직접 확인 안내", permission: "기존 근거로 설명만" },
] as const;
export type Department = typeof DEPARTMENTS[number]["id"];
export type CaseStatus = "ready" | "running" | "failed" | "awaiting_approval" | "rejected" | "complete" | "withdrawn";
export interface CaseInput {
  origin: "manual" | "factcheck" | "fixture";
  claim: string;
  claimedDate: string | null;
  pageUrl: string | null;
  imageUrl: string | null;
  thumbnail: string | null; // <=512px, stripped metadata; never the original
  imageHash: string | null;
  provenance: Evidence[];
  candidateUrls: string[];
  channels: Channel[];
  topic: Topic | null;
  contentFlags: ContentFlag[];
  rightsConfirmed: boolean;
  reportedBy: string;
  feedReview?: { url: string; publisher: string; rating: string; reviewedAt: string | null };
}
export interface Section {
  department: Department;
  state: "running" | "done" | "failed" | "waiting";
  attempt: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  data: Record<string, unknown>;
  error: { code: string; message: string } | null;
}
export interface CaseRecord {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  stage: "intake" | Department | "complete";
  status: CaseStatus;
  input: CaseInput;
  sections: Partial<Record<Department, Section>>;
  approvals: { operatorId: string; at: string; title: string; summary: string }[];
  publicCase: PublicCase | null;
  evaluation: { expected: Verdict; reason: string; operatorId: string; at: string } | null;
  run: { token: string; expiresAt: number } | null;
  desks?: Partial<Record<import("./desks").Desk, { state: "working" | "done" | "hold" | "failed"; hash?: string; calls: number; durationMs: number; error?: string }>>;
  editor?: { state: "working" | "done" | "failed"; calls: number; at: string };
}
export interface CaseEvent {
  seq: number;
  caseId: string;
  department: CaseRecord["stage"] | "reliability";
  state: CaseStatus | "done" | "warning" | "agent_working" | "agent_idle" | "speaking";
  actor?: string;
  desk?: import("./desks").Desk | "editor";
  action?: "report_started" | "report_completed" | "briefing_started" | "briefing_completed";
  at: string;
  summary: string; // code-written, <=200; no raw page/model prose or credentials
  cite: string[];
}
export type NewEvent = Omit<CaseEvent, "seq">;
export const departmentLabel = (id: CaseRecord["stage"]) => DEPARTMENTS.find(d => d.id === id)?.label ?? (id === "intake" ? "접수" : "완료");
export class CaseError extends Error {
  constructor(readonly code: string, message: string, readonly metrics?: { llmCalls: number }) { super(message); this.name = "CaseError"; }
}
export const sectionData = <T>(c: Readonly<CaseRecord>, id: Department): T => {
  if (c.sections[id]?.state !== "done") throw new CaseError("missing_section", "이전 부서 기록이 완료되지 않았어요.");
  return c.sections[id]!.data as T;
};

export const statusLabel: Record<CaseStatus,string> = {ready:"진행 대기",running:"작업 중",failed:"실패 · 중단",awaiting_approval:"사람 승인 대기",rejected:"반려",complete:"완료",withdrawn:"공개 철회"};
