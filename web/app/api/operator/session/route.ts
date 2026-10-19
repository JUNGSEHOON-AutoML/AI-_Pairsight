import { cookies } from "next/headers";
import { OPERATOR_COOKIE, currentOperator, operatorAuth, requireSameOrigin, newsroomError } from "@/lib/newsroom/operator-session";
import { boundedRequest } from "@/lib/newsroom/intake";
export async function GET() {
  return Response.json({ operator: await currentOperator(), configured: operatorAuth().configured() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    const body = await (await boundedRequest(req, 2048)).json();
    const token = operatorAuth().login(String(body.id ?? ""), String(body.password ?? ""));
    (await cookies()).set(OPERATOR_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: new URL(req.url).protocol === "https:", path: "/", maxAge: 8 * 3600 });
    return Response.json({ ok: true });
  } catch (e) { return newsroomError(e); }
}
export async function DELETE(req: Request) {
  try {
    requireSameOrigin(req);
    const jar = await cookies(), value = jar.get(OPERATOR_COOKIE)?.value;
    if (value) operatorAuth().logout(value);
    jar.delete(OPERATOR_COOKIE);
    return Response.json({ ok: true });
  } catch (e) { return newsroomError(e); }
}
