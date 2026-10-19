// Provider seams. The analysis pipeline only talks to these interfaces, so swapping the mock for
// Google Vision / TinEye / Fact Check (reverse-search-comparison.md) changes no screen or pipeline code.
import type { Evidence } from "../domain";
import type { Candidate } from "../verification/types";

export interface ImageInput {
  bytes: Uint8Array;
  mime: string;
  sha256: string; // hex
  publicUrl: string | null; // set when the image came from a URL; some providers (Fact Check imageSearch) need one
}

export interface ReverseSearchResult {
  candidates: Candidate[]; // discovery only; never trusted as verified originals
  searchedProviders: string[]; // shown as "검색한 곳"
}

export interface ReverseSearchProvider {
  readonly name: string;
  search(image: ImageInput, signal: AbortSignal): Promise<ReverseSearchResult>;
}

// C2PA, watermark, pixel model, EXIF, screen recapture, fact-check records.
export interface SignalProvider {
  readonly name: string;
  collect(image: ImageInput, signal: AbortSignal): Promise<Evidence[]>;
}

export interface PageImage {
  url: string;
  alt: string | null;
}

export interface FetchedImage {
  bytes: Uint8Array;
  mime: string;
}

export interface UrlImageExtractor {
  readonly name: string;
  listImages(pageUrl: string, signal: AbortSignal): Promise<PageImage[]>;
  fetchImage(imageUrl: string, signal: AbortSignal): Promise<FetchedImage>;
}

export class ProviderError extends Error {
  constructor(
    public code: "provider_timeout" | "url_blocked" | "url_no_image" | "unsupported_type" | "too_large",
    message: string,
  ) {
    super(message);
  }
}
