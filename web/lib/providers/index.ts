// Mock-only composition. Enabling a live transport or API requires a separately reviewed adapter.
import { MockReverseSearchProvider } from "./mock";
import type { ReverseSearchProvider, UrlImageExtractor } from "./types";
import type { InputProvider, FactCheckProvider, TemporaryImageProvider, CandidateVerificationProvider, ImageComparisonProvider, ProvenanceProvider, ContextComparisonProvider, VerdictProvider, PageFetchProvider } from "../verification/types";
import { NormalizingInputProvider, OnDemandCandidateVerifier } from "../verification/adapters";
import { OnDemandPageProvider, PolicyFetch } from "../verification/page-fetch";
import { LocalImageComparisonProvider } from "../verification/image-comparison";
import { MockArchiveDateProvider, MockContextProvider, MockFactCheckProvider, MockProvenanceProvider, MockTemporaryImageProvider, mockTransport } from "../verification/mock";
import { decideVerdict } from "../verdict";
import { loadTrustedSources } from "../verification/trusted-sources";

export const providerMode = process.env.PAIRSIGHT_PROVIDERS ?? "mock";
export const isMock = providerMode === "mock";
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
let cached: Providers | null = null;
export function getProviders(): Providers {
  if (!isMock) throw new Error("Only PAIRSIGHT_PROVIDERS=mock is implemented.");
  return cached ??= createMockProviders();
}
