import { requireOperator, requireSameOrigin, newsroomError } from "@/lib/newsroom/operator-session";
import { boundedRequest } from "@/lib/newsroom/intake";
import { caseRepository } from "@/lib/newsroom/repository";
import { CaseError } from "@/lib/newsroom/model";
import { requireReviewReport } from "@/lib/newsroom/report-access";
import { publicUrl } from "@/lib/verification/retention";
import { assertFetchableUrl } from "@/lib/net/ssrf";
import { reviewCase, labelCase } from "@/lib/newsroom/review";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(req); const operator = await requireOperator(), { id } = await ctx.params;
    const body = await (await boundedRequest(req, 4096)).json(), repo = caseRepository();
    if (body.action === "candidates") {
      const urls = [...new Set(String(body.urls??"").split(/\r?\n/).map(u=>u.trim()).filter(Boolean))];
      if (!urls.length || urls.length>5 || urls.some(u=>!publicUrl(u))) throw new CaseError("invalid_url","후보 공개 링크를 최대 5개 입력해 주세요.");
      for (const u of urls) { try { assertFetchableUrl(u); } catch { throw new CaseError("invalid_url","외부 공개 주소만 가능해요."); } }
      repo.mutate(id,(c,emit)=>{
        if(c.run||c.status!=="failed"||c.revision!==body.revision||c.approvals.length)throw new CaseError("invalid_state","승인 전 중단 사건에서만 후보를 보충할 수 있어요.");
        c.input.candidateUrls=urls;
        for(const dep of ["osint","ai_data","factcheck","legal","trust_safety","communications","literacy"] as const)delete c.sections[dep];
        for(const desk of ["research","judgment","review","publication"] as const)if(c.desks)delete c.desks[desk];
        c.stage="osint";c.status="ready";emit({department:"osint",state:"ready",summary:"운영자가 후보 링크 보충 · 조사 재개",cite:[]});
      });
    } else if (body.action === "retry") {
      repo.mutate(id, (c, emit) => {
        if (c.run || c.status !== "failed" || c.revision !== body.revision) throw new CaseError("invalid_state", "변경된 사건 또는 처리 중인 사건은 재시작할 수 없어요.");
        c.status = "ready";
        emit({ department: c.stage, state: "ready", summary: "운영자가 실패 단계 재시작 요청", cite: [] });
      });
    } else if (["approve", "reject", "withdraw"].includes(body.action)) {
      if(body.action==="approve") {const c=repo.get(id);if(!c)throw new CaseError("not_found","사건이 없어요.");requireReviewReport(c);}
      reviewCase(repo, id, operator, Number(body.revision), body.action, { title: body.title, summary: body.summary });
    } else if (body.action === "label") labelCase(repo, id, operator, body.expected, String(body.reason ?? ""));
    else throw new CaseError("invalid_action", "지원하지 않는 작업입니다.");
    return Response.json({ ok: true });
  } catch (e) { return newsroomError(e); }
}
