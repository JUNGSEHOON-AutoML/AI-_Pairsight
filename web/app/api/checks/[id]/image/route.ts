// GET /api/checks/:id/image — the uploaded image, only for the check's owner (private by default).
import { getStore } from "@/lib/data/store";
import { notFound, ownedCheck } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owned = await ownedCheck(id);
  if (!owned) return notFound();
  const file = await getStore().readUpload(id);
  if (!file) return notFound();
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.mime,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
