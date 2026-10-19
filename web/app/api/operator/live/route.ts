import { cookies } from "next/headers";
import { operatorAuth, OPERATOR_COOKIE } from "@/lib/newsroom/operator-session";
import { caseRepository } from "@/lib/newsroom/repository";
import { newsroomStream } from "@/lib/newsroom/live";

export async function GET(req: Request) {
  const token = (await cookies()).get(OPERATOR_COOKIE)?.value, auth = operatorAuth();
  const authorized = () => !!auth.verify(token);
  if (!authorized()) return Response.json({error:"unauthorized"}, {status:401});
  return new Response(newsroomStream(caseRepository(), authorized, req.signal), {headers:{
    "Content-Type":"text/event-stream", "Cache-Control":"private, no-store, no-transform",
    "X-Accel-Buffering":"no", "X-Content-Type-Options":"nosniff",
  }});
}
