import type { CaseRepository } from "./repository";
import { CaseError, sectionData, type CaseRecord } from "./model";
import type { Topic } from "../public/types";
import { VERDICTS, type Verdict } from "../domain";
import type { PublicCase } from "../public/types";

/** Operator identity comes from a server-side session, never the request body. Optimistic revision binds approval to the reviewed snapshot. */
export function reviewCase(repo: CaseRepository, id: string, operatorId: string, revision: number, action: "approve" | "reject" | "withdraw",
  fields: { title?: string; summary?: string } = {}) {
  if (!operatorId) throw new CaseError("unauthorized", "운영자 로그인이 필요해요.");
  return repo.mutate(id, (c, emit) => {
    if (c.revision !== revision || c.run) throw new CaseError("stale_review", "사건이 변경됐어요. 새 기록을 확인하고 다시 검토해 주세요.");
    if (action === "withdraw") {
      if (!["complete", "ready", "failed"].includes(c.status) || !c.approvals.length) throw new CaseError("invalid_state", "철회할 승인 기록이 없어요.");
      c.status = "withdrawn"; c.publicCase = null;
    } else {
      if (c.status !== "awaiting_approval" || c.stage !== "trust_safety") throw new CaseError("invalid_state", "승인 대기 사건만 검토할 수 있어요.");
      if (action === "reject") c.status = "rejected";
      else {
        if (c.input.contentFlags.some(f => ["sexual_content", "minor", "private_person"].includes(f))) throw new CaseError("content_blocked", "게재 금지 콘텐츠입니다. 승인할 수 없어요.");
        if (c.approvals.some(a => a.operatorId === operatorId)) throw new CaseError("independent_review", "두 번째 검토는 다른 운영자가 맡아야 해요.");
        const first = c.approvals[0];
        const title = (first?.title ?? fields.title ?? "").trim(), summary = (first?.summary ?? fields.summary ?? "").trim();
        if (!title || title.length > 160 || !summary || [...summary].length > 200) throw new CaseError("review_text", "사실 제목(160자)과 공개 요약(200자)을 작성해 주세요.");
        c.approvals.push({ operatorId, at: new Date().toISOString(), title, summary });
        const required = sectionData<{ topic: Topic }>(c, "monitoring").topic === "politics" ? 2 : 1;
        if (c.approvals.length >= required) { c.status = "ready"; c.sections.trust_safety!.state = "done"; }
      }
    }
    emit({ department: "trust_safety", state: c.status, summary: action === "approve" ? "사람 검토 기록 추가" : action === "reject" ? "사람 검토 반려" : "공개 승인 철회", cite: [] });
  });
}

export function labelCase(repo: CaseRepository, id: string, operatorId: string, expected: Verdict, reason: string) {
  if (!operatorId || !(VERDICTS as readonly string[]).includes(expected) || !reason.trim() || [...reason].length > 200) throw new CaseError("invalid_label", "평가 판정과 200자 이내 근거가 필요해요.");
  return repo.mutate(id, (c, emit) => {
    c.evaluation = { expected, reason, operatorId, at: new Date().toISOString() };
    emit({ department: "reliability", state: "warning", summary: "사람의 평가 라벨 기록", cite: [] });
  });
}

export function publicProjection(c: CaseRecord): PublicCase | null {
  if (c.input.origin === "fixture" || c.status !== "complete" || !c.approvals.length) return null;
  return (c.sections.literacy?.data.publicCase as PublicCase | undefined) ?? null;
}
