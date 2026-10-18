// DELETE /api/account — delete this user, their checks and uploaded files (recon F06).
// Shared analyses stay (they hold no uploaded file), as in schema.sql.
import type { NextRequest } from "next/server";
import { getStore } from "@/lib/data/store";
import { ACCOUNT_DELETE_PHRASE } from "@/lib/domain";
import { json } from "@/lib/http";
import { clearSession, currentUser } from "@/lib/session";

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return json({ error: "no_session" }, 401);
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== ACCOUNT_DELETE_PHRASE) return json({ error: "confirm_required" }, 400);
  await getStore().deleteUser(user.id);
  await clearSession();
  return json({ ok: true });
}
