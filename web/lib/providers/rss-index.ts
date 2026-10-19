// ReverseSearchProvider over the trusted-source RSS hash index (replica/rss-hash-index.md).
// It only proposes candidates; every candidate is still fetched and compared before any verdict.
import { DEFAULT_INDEX_PATH, IndexStore } from "../index/store";
import { hashDistance, imageHashes } from "../index/hashes";
import type { ImageInput, ReverseSearchProvider, ReverseSearchResult } from "./types";

export const INDEX_MAX_DISTANCE = 10; // of 63 bits; deliberately loose, the comparison step is the real gate
export const INDEX_MAX_CANDIDATES = 5;

/** "신뢰 출처 RSS 색인 (2026-10-19부터 수집)": also the hook the result screen uses for the coverage note. */
export function indexLabel(startedAt: string | null) {
  return startedAt ? `신뢰 출처 RSS 색인 (${startedAt.slice(0, 10)}부터 수집)` : "신뢰 출처 RSS 색인 (아직 수집 전)";
}
export const isIndexLabel = (label: string) => label.startsWith("신뢰 출처 RSS 색인");

export class RssIndexReverseSearch implements ReverseSearchProvider {
  readonly name = "rss-index";
  constructor(private path: string = DEFAULT_INDEX_PATH()) {}

  async search(image: ImageInput, signal: AbortSignal): Promise<ReverseSearchResult> {
    signal.throwIfAborted();
    const store = new IndexStore(this.path); // re-read: the collector may have added entries
    const query = await imageHashes(image.bytes);
    const scored = store.all()
      .map((e) => ({ e, d: hashDistance(query, e.hashes) }))
      .filter((x) => x.d <= INDEX_MAX_DISTANCE)
      .sort((a, b) => a.d - b.d)
      .slice(0, INDEX_MAX_CANDIDATES);
    return {
      candidates: scored.map(({ e }) => ({
        url: e.articleUrl,
        imageUrl: e.imageUrl,
        provider: this.name,
        ...(e.publishedAt ? { discoveredAt: e.publishedAt.slice(0, 10) } : {}),
      })),
      searchedProviders: [indexLabel(store.meta.startedAt)],
    };
  }
}
