// RSS → hash index collector (replica/rss-hash-index.md).
// Only feeds with status "allowed" are ever requested. Feed and image requests go through PolicyFetch
// (robots, per-origin spacing, Retry-After, SSRF guard). A blocking response stops that source for the run.
import { ProviderError } from "../providers/types";
import type { PolicyFetch } from "../verification/page-fetch";
import { findTrustedSource, type TrustedSourceList } from "../verification/trusted-sources";
import { imageHashes } from "./hashes";
import { parseFeed } from "./rss";
import type { FeedRun, IndexStore } from "./store";

const FEED_TYPES = /(rss|atom|xml)/i;
const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/i;
// Responses that mean "stop asking this source now" (vs. a single missing image).
const BLOCKING = /robots|page unavailable: (401|403|429|451|503)|challenge|retention|cross-origin/i;

export interface CollectOptions {
  sources: TrustedSourceList;
  fetcher: PolicyFetch;
  store: IndexStore;
  maxItemsPerFeed?: number;
  signal?: AbortSignal;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface CollectReport {
  runs: FeedRun[];
  notFetched: { url: string; status: string; reason: string }[]; // excluded / pending feeds, never requested
}

export async function collectFeeds(opts: CollectOptions): Promise<CollectReport> {
  const { sources, fetcher, store } = opts;
  const max = opts.maxItemsPerFeed ?? 30;
  const signal = opts.signal ?? AbortSignal.timeout(10 * 60_000);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const report: CollectReport = { runs: [], notFetched: [] };

  for (const source of sources.sources) {
    let stopped: string | null = null;
    for (const feed of source.feeds) {
      if (feed.status !== "allowed") {
        report.notFetched.push({ url: feed.url, status: feed.status, reason: feed.reason });
        continue;
      }
      const run: FeedRun = { url: feed.url, at: now().toISOString(), added: 0, skipped: 0, stoppedReason: null };
      if (stopped) {
        run.stoppedReason = `same source stopped earlier: ${stopped}`;
        report.runs.push(run);
        store.recordRun(run);
        continue;
      }
      try {
        const res = await fetcher.fetch(feed.url, signal);
        if (!FEED_TYPES.test(res.headers["content-type"] ?? "")) throw new ProviderError("url_blocked", "not a feed");
        const items = parseFeed(new TextDecoder().decode(res.bytes), res.url, max);
        for (const item of items) {
          // Items must belong to this trusted source; never index third-party links a feed may carry.
          if (!item.imageUrl || findTrustedSource(item.link, sources)?.id !== source.id || store.has(item.link, item.imageUrl)) {
            run.skipped++;
            continue;
          }
          try {
            const img = await fetcher.fetch(item.imageUrl, signal);
            const mime = (img.headers["content-type"] ?? "").split(";")[0].trim();
            if (!IMAGE_TYPES.test(mime)) {
              run.skipped++;
              continue;
            }
            const hashes = await imageHashes(img.bytes); // bytes are dropped after this line
            if (store.add({ v: 1, sourceId: source.id, articleUrl: item.link, publishedAt: item.publishedAt, imageUrl: item.imageUrl, hashes, collectedAt: now().toISOString() })) run.added++;
          } catch (e) {
            signal.throwIfAborted();
            if (e instanceof ProviderError && BLOCKING.test(e.message)) throw e;
            run.skipped++; // one unavailable or undecodable image
          }
        }
      } catch (e) {
        signal.throwIfAborted();
        run.stoppedReason = (e as Error).message;
        stopped = run.stoppedReason;
        log(`[index] ${source.id}: stopped (${run.stoppedReason})`);
      }
      report.runs.push(run);
      store.recordRun(run);
      log(`[index] ${source.id} ${feed.url}: +${run.added}, skipped ${run.skipped}${run.stoppedReason ? `, stopped: ${run.stoppedReason}` : ""}`);
    }
  }
  return report;
}
