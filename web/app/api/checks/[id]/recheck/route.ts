// POST /api/checks/:id/recheck — 재검사: same image, fresh analysis (costs one free check).
import { getStore } from "@/lib/data/store";
import { json, notFound, ownedCheck } from "@/lib/http";
import { startCheck } from "@/lib/pipeline";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owned = await ownedCheck(id);
  if (!owned) return notFound();
  const file = await getStore().readUpload(id);
  if (!file) return notFound();
  const { check, user } = owned;
  const result = await startCheck(user, {
    bytes: file.bytes,
    mime: file.mime,
    fileName: check.fileName,
    inputType: check.inputType,
    pageUrl: check.pageUrl,
    publicImageUrl: null,
    claimedDate: check.claimedDate,
    forceFresh: true,
  });
  if (!result.ok && result.reason === "quota") return json({ reason: "quota", used: result.used, limit: result.limit }, 429);
  if (!result.ok) return json({ errorCode: result.errorCode }, 400);
  return json({ id: result.check.id }, 201);
}
