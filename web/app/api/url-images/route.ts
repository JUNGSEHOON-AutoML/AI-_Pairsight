// POST /api/url-images — list the images on a page so the user can pick one. Free: no quota taken.
import type { NextRequest } from "next/server";
import { errorCode, json } from "@/lib/http";
import { getProviders } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/types";
import { requireUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = (await req.json().catch(() => null)) as { pageUrl?: unknown } | null;
  const pageUrl = typeof body?.pageUrl === "string" ? body.pageUrl.trim() : "";
  if (!pageUrl) return json({ error: "bad_request" }, 400);
  try {
    const images = await getProviders().urls.listImages(pageUrl, AbortSignal.timeout(15_000));
    return json({ pageUrl, images });
  } catch (e) {
    if (e instanceof ProviderError) return errorCode(e.code === "provider_timeout" ? "url_blocked" : e.code);
    return errorCode("url_blocked");
  }
}
