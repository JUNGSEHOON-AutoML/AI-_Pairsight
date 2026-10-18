// GET /api/history — this browser's checks, newest first, with the verdict computed per check.
import { getStore } from "@/lib/data/store";
import { json } from "@/lib/http";
import { verdictForCheck } from "@/lib/pipeline";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return json({ items: [] });
  const store = getStore();
  const items = [];
  for (const c of await store.listChecks(user.id)) {
    const a = await store.getAnalysis(c.analysisId);
    if (!a) continue;
    items.push({
      id: c.id,
      createdAt: c.createdAt,
      status: a.status,
      verdict: verdictForCheck(a, c)?.verdict ?? null,
      fileName: c.fileName,
      pageUrl: c.pageUrl,
      imageUrl: `/api/checks/${c.id}/image`,
    });
  }
  return json({ items });
}
