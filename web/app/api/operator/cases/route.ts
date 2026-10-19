import { requireOperator, requireSameOrigin, newsroomError } from "@/lib/newsroom/operator-session";
import { boundedRequest, intake } from "@/lib/newsroom/intake";
import { caseRepository } from "@/lib/newsroom/repository";
import { reliability } from "@/lib/newsroom/reliability";
export async function GET() {
  try {
    await requireOperator(); const r = caseRepository(), cases = r.list();
    return Response.json({ cases, metrics: reliability(cases, r.allEvents()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return newsroomError(e); }
}
export async function POST(req: Request) {
  try {
    requireSameOrigin(req); const operator = await requireOperator();
    const c = caseRepository().create(await intake(await (await boundedRequest(req)).formData(), operator));
    return Response.json({ id: c.id }, { status: 201 });
  } catch (e) { return newsroomError(e); }
}
