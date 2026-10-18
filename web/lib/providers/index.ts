// Picks the providers. Only "mock" exists today: reverse-search-comparison.md recommends
// Vision + TinEye + Fact Check, but none is under contract yet (TinEye terms still unread).
import { HttpUrlImageExtractor } from "./http-extractor";
import { MockReverseSearchProvider, MockSignalProvider, MockUrlImageExtractor } from "./mock";
import type { PageImage, ReverseSearchProvider, SignalProvider, UrlImageExtractor } from "./types";

export const providerMode = process.env.PAIRSIGHT_PROVIDERS ?? "mock";
export const isMock = providerMode === "mock";

class RoutingExtractor implements UrlImageExtractor {
  readonly name = "routing";
  constructor(
    private demo: MockUrlImageExtractor,
    private http: HttpUrlImageExtractor,
  ) {}
  private pick(url: string) {
    return isMock && this.demo.handles(url) ? this.demo : this.http;
  }
  listImages(pageUrl: string, signal: AbortSignal): Promise<PageImage[]> {
    return this.pick(pageUrl).listImages(pageUrl, signal);
  }
  fetchImage(imageUrl: string, signal: AbortSignal) {
    return this.pick(imageUrl).fetchImage(imageUrl, signal);
  }
}

export interface Providers {
  reverseSearch: ReverseSearchProvider;
  signals: SignalProvider;
  urls: UrlImageExtractor;
}

let cached: Providers | null = null;
export function getProviders(): Providers {
  if (cached) return cached;
  if (!isMock) {
    throw new Error(`PAIRSIGHT_PROVIDERS=${providerMode} is not implemented yet. Use "mock".`);
  }
  cached = {
    reverseSearch: new MockReverseSearchProvider(),
    signals: new MockSignalProvider(),
    urls: new RoutingExtractor(new MockUrlImageExtractor(), new HttpUrlImageExtractor()),
  };
  return cached;
}
