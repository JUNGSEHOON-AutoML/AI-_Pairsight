// Mock-only composition. Enabling a live transport or API requires a separately reviewed adapter.
import { MockReverseSearchProvider } from "./mock";
import type { ReverseSearchProvider, UrlImageExtractor } from "./types";
import type { InputProvider, FactCheckProvider, TemporaryImageProvider, CandidateVerificationProvider, ImageComparisonProvider, ProvenanceProvider, ContextComparisonProvider, VerdictProvider, PageFetchProvider } from "../verification/types";
import { LocalMetadataProvider, NormalizingInputProvider, OnDemandCandidateVerifier } from "../verification/adapters";
import { guardedTransport, OnDemandPageProvider, PolicyFetch, type Transport } from "../verification/page-fetch";
import { RssIndexReverseSearch } from "./rss-index";
import { LocalImageComparisonProvider } from "../verification/image-comparison";
import { MockArchiveDateProvider, MockContextProvider, MockFactCheckProvider, MockProvenanceProvider, MockTemporaryImageProvider, mockTransport } from "../verification/mock";
import { decideVerdict } from "../verdict";
import { loadTrustedSources } from "../verification/trusted-sources";

export const providerMode = process.env.PAIRSIGHT_PROVIDERS ?? "mock";
export const isMock = providerMode === "mock";
// free: no paid search. RSS hash index for discovery + the real fetch/compare pipeline.
// PAIRSIGHT_TRANSPORT=mock runs it on fixture feeds and pages with no network (demos, screenshots).
export const isFree = providerMode === "free";
export const usesMockTransport = isMock || (isFree && process.env.PAIRSIGHT_TRANSPORT === "mock");
export interface Providers {
  input: InputProvider;
  reverseSearch: ReverseSearchProvider;
  factCheck: FactCheckProvider;
  temporaryImages: TemporaryImageProvider;
  candidates: CandidateVerificationProvider;
  images: ImageComparisonProvider;
  provenance: ProvenanceProvider;
  context: ContextComparisonProvider;
  verdict: VerdictProvider;
  pages: PageFetchProvider;
  urls: UrlImageExtractor;
}
export function createMockProviders(): Providers {
  const pages = new OnDemandPageProvider(new PolicyFetch(mockTransport, 0));
  const temporaryImages = new MockTemporaryImageProvider();
  return {
    input: new NormalizingInputProvider(pages),
    reverseSearch: new MockReverseSearchProvider(),
    factCheck: new MockFactCheckProvider(temporaryImages), temporaryImages,
    candidates: new OnDemandCandidateVerifier(pages, new MockArchiveDateProvider()),
    images: new LocalImageComparisonProvider(), provenance: new MockProvenanceProvider(),
    context: new MockContextProvider(), verdict: { name: "evidence-rules-v3",
      // The trusted list is re-read when its file changes; mock mode adds the fictional fixture domains.
      decide: (i) => decideVerdict({ ...i, trustedSources: i.trustedSources ?? loadTrustedSources({ includeMock: isMock }) }) }, pages,
    urls: { name: "mock-pages", listImages: async (url, signal) => (await pages.page(url, signal)).images,
      fetchImage: (url, signal) => pages.image(url, signal) },
  };
}
/** No paid APIs: candidates from the RSS index, then the same policy-gated fetch, comparison and v3 verdict. */
export function createFreeProviders(transport: Transport, indexPath?: string): Providers {
  const pages = new OnDemandPageProvider(new PolicyFetch(transport, transport === mockTransport ? 0 : 1000));
  const demo = transport === mockTransport;
  return {
    input: new NormalizingInputProvider(pages),
    reverseSearch: new RssIndexReverseSearch(indexPath),
    factCheck: { name: "팩트체크 (미연결)", search: async () => [] },
    temporaryImages: { name: "none", publish: async () => ({ url: "https://unused.invalid/none", expiresAt: new Date().toISOString(), revoke: async () => {} }) },
    candidates: new OnDemandCandidateVerifier(pages, { name: "no-archive", firstCapture: async () => null }),
    images: new LocalImageComparisonProvider(),
    provenance: new LocalMetadataProvider(),
    context: { name: "no-context", compare: async () => [] },
    verdict: { name: "evidence-rules-v3", decide: (i) => decideVerdict({ ...i, trustedSources: i.trustedSources ?? loadTrustedSources({ includeMock: demo }) }) },
    pages,
    urls: { name: "policy-gated-pages", listImages: async (url, signal) => (await pages.page(url, signal)).images, fetchImage: (url, signal) => pages.image(url, signal) },
  };
}

let cached: Providers | null = null;
export function getProviders(): Providers {
  if (isFree) return cached ??= createFreeProviders(usesMockTransport ? mockTransport : guardedTransport);
  if (!isMock) throw new Error("PAIRSIGHT_PROVIDERS must be mock or free.");
  return cached ??= createMockProviders();
}
