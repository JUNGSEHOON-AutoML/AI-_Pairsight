// GET /auth/callback?token=… — finish the magic link.
// New email: attach it to the current (anonymous) user, so earlier checks stay in the history.
// Known email: transfer anonymous history and quota, then switch to that account.
import type { NextRequest } from "next/server";
import { getStore } from "@/lib/data/store";
import { setSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const user = await getStore().completeLogin(token);
  // Relative redirects keep the browser's origin. NextURL normalizes 127.0.0.1 to
  // localhost, which would otherwise split anonymous and signed-in session cookies.
  if (!user) return new Response(null, { status: 303, headers: { Location: "/login?error=expired" } });
  await setSessionUser(user.id);
  return new Response(null, { status: 303, headers: { Location: "/history?welcome=1" } });
}
