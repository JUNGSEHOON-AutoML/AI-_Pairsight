// POST /api/auth/login — start a magic-link sign-in.
// No email provider is wired yet, so in mock mode the link is returned to the page (clearly marked DEV);
// outside mock mode this refuses instead of pretending an email was sent.
import type { NextRequest } from "next/server";
import { getStore } from "@/lib/data/store";
import { json } from "@/lib/http";
import { isMock } from "@/lib/providers";
import { requireUser } from "@/lib/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return json({ error: "bad_email" }, 400);
  if (!isMock) return json({ error: "email_not_configured" }, 501);

  const user = await requireUser();
  const token = await getStore().createLoginToken(user.id, email);
  const devLink = new URL(`/auth/callback?token=${encodeURIComponent(token)}`, req.nextUrl.origin).toString();
  return json({ sent: false, devLink });
}
