// GET /auth/callback?token=… — finish the magic link.
// New email: attach it to the current (anonymous) user, so earlier checks stay in the history.
// Known email: switch this browser to that account.
import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/data/store";
import { setSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const store = getStore();
  const t = await store.consumeLoginToken(token);
  if (!t) return NextResponse.redirect(new URL("/login?error=expired", req.nextUrl.origin));

  const existing = await store.findUserByEmail(t.email);
  if (existing && existing.id !== t.userId) {
    await setSessionUser(existing.id);
  } else {
    await store.linkEmail(t.userId, t.email);
    await setSessionUser(t.userId);
  }
  return NextResponse.redirect(new URL("/history?welcome=1", req.nextUrl.origin));
}
