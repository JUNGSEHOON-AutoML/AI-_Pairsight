// Provider sets for the evaluation harness.
// live (default, free): the app's real page fetch (robots, rate limits, SSRF guard) + real pixel comparison
//       + real EXIF check. No fact-check, archive, C2PA or LLM. Candidates come from, per case:
//         manual  — the case's sourceUrls (no search at all)
//         index   — the trusted-source RSS hash index (when one is given)
//         vision  — Google Vision, only if GOOGLE_VISION_API_KEY is set (not used by the project for now)
//         none    — no search: the case gets no candidates and ends up 판단 불가
// mock: the app's fixture providers (synthetic fixtures only).
import { createMockProviders, type Providers } from "../lib/providers";
import { GoogleVisionReverseSearch } from "../lib/providers/google-vision";
import type { ReverseSearchProvider } from "../lib/providers/types";
import { decideVerdict } from "../lib/verdict";
import { LocalMetadataProvider, NormalizingInputProvider, OnDemandCandidateVerifier } from "../lib/verification/adapters";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
import { guardedTransport, OnDemandPageProvider, PolicyFetch } from "../lib/verification/page-fetch";
import type { EvalCase, ManualSource } from "./metrics";

export type Mode = "live" | "mock";
export type CandidateSource = "manual" | "index" | "vision" | "none" | "mock-search";
export const CANDIDATE_SOURCE_LABEL: Record<CandidateSource, string> = {
  manual: "수동 후보 (검색 없음)",
  index: "신뢰 출처 RSS 색인",
  vision: "Google Vision",
  none: "검색 안 함 (후보 없음)",
  "mock-search": "모의 검색",
};

export const noSearch: ReverseSearchProvider = {
  name: "none",
  search: async () => ({ candidates: [], searchedProviders: [] }),
};

/** Skips discovery entirely: the given pages go straight to candidate verification. */
export function manualCandidates(list: ManualSource[]): ReverseSearchProvider {
  return {
    name: "manual",
    search: async () => ({
      candidates: list.map((s) => ({ url: s.url, provider: "수동 후보", ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}) })),
      searchedProviders: ["수동 후보 (검색 안 함)"],
    }),
  };
}

export function liveProviders(reverseSearch: ReverseSearchProvider): Providers {
  const pages = new OnDemandPageProvider(new PolicyFetch(guardedTransport, 1000));
  return {
    input: new NormalizingInputProvider(pages),
    reverseSearch,
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

export interface ProviderChoice {
  mode: Mode;
  providers: Providers;
  defaultSource: CandidateSource; // used for cases without sourceUrls
}

export function pickProviders(opts: { forceMock: boolean; index?: ReverseSearchProvider | null }): ProviderChoice {
  if (opts.forceMock) return { mode: "mock", providers: createMockProviders(), defaultSource: "mock-search" };
  if (opts.index) return { mode: "live", providers: liveProviders(opts.index), defaultSource: "index" };
  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (key) return { mode: "live", providers: liveProviders(new GoogleVisionReverseSearch(key)), defaultSource: "vision" };
  return { mode: "live", providers: liveProviders(noSearch), defaultSource: "none" };
}

/** Per case: sourceUrls replace the search; everything else (fetch policy, comparison, verdict) stays the same. */
export function providersForCase(choice: ProviderChoice, c: EvalCase): { providers: Providers; source: CandidateSource } {
  if (c.sourceUrls.length) return { providers: { ...choice.providers, reverseSearch: manualCandidates(c.sourceUrls) }, source: "manual" };
  return { providers: choice.providers, source: choice.defaultSource };
}
