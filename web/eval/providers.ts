// Provider sets for the evaluation harness.
// live: Google Vision for discovery + the app's real page fetch (robots, rate limits, SSRF guard) + real
//       pixel comparison + real EXIF check. No fact-check, archive, C2PA or LLM: exactly the
//       "metadata stripped, only pages and pixels" situation verdict v3 is meant to handle.
// mock: the app's fixture providers. Real photos all come back as 원본 없음, so mock results only prove
//       the harness runs; they say nothing about accuracy.
import { createMockProviders, type Providers } from "../lib/providers";
import { GoogleVisionReverseSearch } from "../lib/providers/google-vision";
import { decideVerdict } from "../lib/verdict";
import { LocalMetadataProvider, NormalizingInputProvider, OnDemandCandidateVerifier } from "../lib/verification/adapters";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
import { guardedTransport, OnDemandPageProvider, PolicyFetch } from "../lib/verification/page-fetch";

export type Mode = "live" | "mock";

export function liveProviders(visionKey: string): Providers {
  const pages = new OnDemandPageProvider(new PolicyFetch(guardedTransport, 1000));
  return {
    input: new NormalizingInputProvider(pages),
    reverseSearch: new GoogleVisionReverseSearch(visionKey),
    factCheck: { name: "팩트체크 (평가에서 생략)", search: async () => [] },
    // Never called with a real upload: the fact-check provider above returns nothing.
    temporaryImages: { name: "none", publish: async () => ({ url: "https://unused.invalid/none", expiresAt: new Date().toISOString(), revoke: async () => {} }) },
    candidates: new OnDemandCandidateVerifier(pages, { name: "no-archive", firstCapture: async () => null }),
    images: new LocalImageComparisonProvider(),
    provenance: new LocalMetadataProvider(),
    context: { name: "no-context", compare: async () => [] },
    verdict: { name: "unused-in-eval", decide: decideVerdict },
    pages,
    urls: { name: "unused-in-eval", listImages: async () => [], fetchImage: (u, s) => pages.image(u, s) },
  };
}

export function pickProviders(opts: { forceMock: boolean }): { mode: Mode; providers: Providers } {
  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (key && !opts.forceMock) return { mode: "live", providers: liveProviders(key) };
  return { mode: "mock", providers: createMockProviders() };
}
