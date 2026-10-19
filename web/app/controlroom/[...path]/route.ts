import { requireOperator, newsroomError } from "@/lib/newsroom/operator-session";
import { viewerTarget } from "@/lib/newsroom/viewer-proxy";

export async function GET(req: Request, ctx: {params:Promise<{path:string[]}>}) {
  try { await requireOperator(); } catch (e) { return newsroomError(e); }
  const target = viewerTarget((await ctx.params).path);
  if (!target) return new Response("Not found", {status:404});
  try {
    // Query is fixed: embedded viewer accepts snapshots from its authenticated parent only.
    const upstream = await fetch(target + (target.endsWith("/newsroom") ? "?embed=1" : ""), {
      cache:"no-store", redirect:"error", signal:AbortSignal.any([req.signal, AbortSignal.timeout(15000)]),
    });
    if (!upstream.ok) { await upstream.body?.cancel(); throw Error(); }
    const headers = new Headers({"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"});
    for (const name of ["content-type", "content-security-policy", "x-frame-options", "referrer-policy"])
      if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name)!);
    return new Response(upstream.body, {headers});
  } catch { return new Response("3D 관제실 연결을 확인하지 못했어요. 사건 기록은 편집국에서 계속 확인할 수 있어요.", {status:503}); }
}
