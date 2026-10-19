import { requireOperator, requireSameOrigin, newsroomError } from "@/lib/newsroom/operator-session";
import { boundedRequest } from "@/lib/newsroom/intake";
import { caseRepository } from "@/lib/newsroom/repository";
import { CaseError } from "@/lib/newsroom/model";
import { reviewCase, labelCase } from "@/lib/newsroom/review";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(req); const operator = await requireOperator(), { id } = await ctx.params;
    const body = await (await boundedRequest(req, 4096)).json(), repo = caseRepository();
    if (body.action === "retry") {
      repo.mutate(id, (c, emit) => {
        if (c.run || c.status !== "failed" || c.revision !== body.revision) throw new CaseError("invalid_state", "변경된 사건 또는 처리 중인 사건은 재시작할 수 없어요.");
        c.status = "ready";
        emit({ department: c.stage, state: "ready", summary: "운영자가 실패 단계 재시작 요청", cite: [] });
      });
    } else if (["approve", "reject", "withdraw"].includes(body.action)) {
      reviewCase(repo, id, operator, Number(body.revision), body.action, { title: body.title, summary: body.summary });
    } else if (body.action === "label") labelCase(repo, id, operator, body.expected, String(body.reason ?? ""));
    else throw new CaseError("invalid_action", "지원하지 않는 작업입니다.");
    return Response.json({ ok: true });
  } catch (e) { return newsroomError(e); }
}
