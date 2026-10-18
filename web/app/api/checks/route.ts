// POST /api/checks — start a check from an uploaded file or from an image URL picked on a page.
import type { NextRequest } from "next/server";
import { errorCode, json, parseClaimedDate } from "@/lib/http";
import { startCheck } from "@/lib/pipeline";
import { getProviders } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/types";
import { MAX_IMAGE_BYTES } from "@/lib/domain";
import { requireUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const claimedDate = parseClaimedDate(form.get("claimedDate"));
  if (claimedDate === "invalid") return json({ error: "bad_date" }, 400);

  const file = form.get("file");
  const imageUrl = form.get("imageUrl");
  const pageUrl = form.get("pageUrl");

  let bytes: Uint8Array;
  let mime: string;
  let fileName: string | null = null;
  let inputType: "image" | "url" = "image";
  let publicImageUrl: string | null = null;

  if (file instanceof File) {
    if (file.size > MAX_IMAGE_BYTES) return errorCode("too_large");
    bytes = new Uint8Array(await file.arrayBuffer());
    mime = file.type;
    fileName = file.name.slice(0, 200);
  } else if (typeof imageUrl === "string" && imageUrl) {
    inputType = "url";
    publicImageUrl = imageUrl;
    try {
      const fetched = await getProviders().urls.fetchImage(imageUrl, AbortSignal.timeout(15_000));
      bytes = fetched.bytes;
      mime = fetched.mime;
    } catch (e) {
      if (e instanceof ProviderError) return errorCode(e.code === "provider_timeout" ? "url_blocked" : e.code);
      return errorCode("url_blocked");
    }
  } else {
    return json({ error: "bad_request" }, 400);
  }

  const result = await startCheck(user, {
    bytes,
    mime,
    fileName,
    inputType,
    pageUrl: typeof pageUrl === "string" && pageUrl ? pageUrl.slice(0, 2000) : null,
    publicImageUrl,
    claimedDate,
  });
  if (!result.ok && result.reason === "quota") return json({ reason: "quota", used: result.used, limit: result.limit }, 429);
  if (!result.ok) return errorCode(result.errorCode);
  return json({ id: result.check.id }, 201);
}
