// GET /api/checks/:id — status, steps and (when done) the verdict computed for this check.
import { notFound, json, ownedCheck } from "@/lib/http";
import { toCheckView } from "@/lib/view";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owned = await ownedCheck(id);
  if (!owned) return notFound();
  return json(toCheckView(owned.check, owned.analysis));
}
