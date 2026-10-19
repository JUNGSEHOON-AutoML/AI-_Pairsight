// Google Cloud Vision Web Detection as a ReverseSearchProvider.
// NOT wired into the app (lib/providers/index.ts stays mock-only until a reviewed rollout); used by eval/ only.
// - The key goes in the x-goog-api-key header, never in the URL, so it does not end up in logs.
// - The image is re-encoded (metadata stripped, ≤1600px JPEG) before it leaves the machine.
// - Vision returns pages and image URLs but no dates (reverse-search-comparison.md); dates come from the
//   candidate pages themselves, fetched later under PolicyFetch.
import sharp from "sharp";
import type { Candidate } from "../verification/types";
import { DECODE_LIMIT } from "../verification/retention";
import { type ImageInput, ProviderError, type ReverseSearchProvider, type ReverseSearchResult } from "./types";

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

interface WebImage { url?: string }
interface WebPage { url?: string; pageTitle?: string; fullMatchingImages?: WebImage[]; partialMatchingImages?: WebImage[] }
interface VisionResponse {
  responses?: { webDetection?: { pagesWithMatchingImages?: WebPage[] }; error?: { code?: number; message?: string } }[];
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class GoogleVisionReverseSearch implements ReverseSearchProvider {
  readonly name = "google-vision-web-detection";
  constructor(
    private apiKey: string,
    private fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private maxResults = 10,
  ) {
    if (!apiKey) throw new Error("GoogleVisionReverseSearch needs an API key");
  }

  async search(image: ImageInput, signal: AbortSignal): Promise<ReverseSearchResult> {
    const jpeg = await sharp(image.bytes, { limitInputPixels: DECODE_LIMIT, pages: 1 })
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer(); // sharp drops EXIF/XMP unless asked to keep it
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        requests: [{ image: { content: jpeg.toString("base64") }, features: [{ type: "WEB_DETECTION", maxResults: this.maxResults }] }],
      }),
      signal,
    }).catch((e) => {
      signal.throwIfAborted();
      throw new ProviderError("provider_timeout", `vision request failed: ${(e as Error).name}`);
    });
    if (!res.ok) throw new ProviderError("provider_timeout", `vision http ${res.status}`);
    const body = (await res.json()) as VisionResponse;
    const first = body.responses?.[0];
    if (first?.error) throw new ProviderError("provider_timeout", `vision error ${first.error.code ?? ""}`.trim());
    const candidates: Candidate[] = [];
    for (const p of first?.webDetection?.pagesWithMatchingImages ?? []) {
      if (!p.url || !/^https?:\/\//i.test(p.url)) continue;
      const imageUrl = p.fullMatchingImages?.[0]?.url ?? p.partialMatchingImages?.[0]?.url;
      candidates.push({ url: p.url, provider: this.name, ...(imageUrl ? { imageUrl } : {}) });
    }
    return { candidates, searchedProviders: ["Google Vision"] };
  }
}
