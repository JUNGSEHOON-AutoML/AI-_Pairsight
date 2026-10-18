// POST /api/auth/logout — forget this browser's session. The next check starts a new anonymous user.
import { json } from "@/lib/http";
import { clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  return json({ ok: true });
}
