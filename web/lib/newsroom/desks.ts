import type { Department, CaseRecord } from "./model";

export const DESKS = [
  { id: "intake", label: "접수", file: "01-접수.md", instruction: "01-intake.md", departments: ["monitoring", "security"] },
  { id: "research", label: "조사", file: "02-조사.md", instruction: "02-research.md", departments: ["osint", "ai_data"] },
  { id: "judgment", label: "판정", file: "03-판정.md", instruction: "03-judgment.md", departments: ["factcheck"] },
  { id: "review", label: "검토", file: "04-검토.md", instruction: "04-review.md", departments: ["legal", "trust_safety"] },
  { id: "publication", label: "발행", file: "05-발행.md", instruction: "05-publication.md", departments: ["communications", "literacy"] },
] as const;
export type Desk = typeof DESKS[number]["id"];
export const deskFor = (stage: CaseRecord["stage"]): Desk | "editor" =>
  stage === "complete" ? "editor" : DESKS.find(d => (d.departments as readonly string[]).includes(stage))?.id ?? "intake";
export const visibleStatus = (c: Pick<CaseRecord, "status">) => c.status === "complete" ? "완료" :
  ["failed", "awaiting_approval", "rejected", "withdrawn"].includes(c.status) ? "사람 검토 필요" : "확인 중";
export const deskDepartments = (id: Desk): readonly Department[] => DESKS.find(d => d.id === id)!.departments;
