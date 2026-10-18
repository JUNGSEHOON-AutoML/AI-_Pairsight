// GET /api/me — who is browsing and how many free checks are left today. Never creates a user.
import { getStore } from "@/lib/data/store";
import { json } from "@/lib/http";
import { currentUser } from "@/lib/session";

const DEFAULT_ANON_LIMIT = Number(process.env.PAIRSIGHT_LIMIT_ANON ?? 3);

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return json({ signedIn: false, email: null, usage: { used: 0, limit: DEFAULT_ANON_LIMIT } });
  }
  const usage = await getStore().usage(user.id);
  return json({ signedIn: user.email != null, email: user.email, usage: { used: usage.used, limit: usage.limit } });
}
