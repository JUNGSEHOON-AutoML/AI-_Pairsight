// Collect allowed trusted-source RSS feeds into the hash index (replica/rss-hash-index.md).
// Usage (from web/): npm run index:collect [-- --index path/to/index.jsonl] [--mock]
//   --mock uses the fixture feeds and the no-network mock transport (for demos and tests).
// Schedule hourly with cron. Only feeds with status "allowed" in config/trusted-sources.json are requested.
import { collectFeeds } from "../lib/index/collector";
import { DEFAULT_INDEX_PATH, IndexStore } from "../lib/index/store";
import { mockTransport } from "../lib/verification/mock";
import { guardedTransport, PolicyFetch } from "../lib/verification/page-fetch";
import { loadTrustedSources } from "../lib/verification/trusted-sources";

async function main() {
  const a = process.argv.slice(2);
  const i = a.indexOf("--index");
  const mock = a.includes("--mock");
  const path = i >= 0 ? a[i + 1] : DEFAULT_INDEX_PATH();
  const sources = loadTrustedSources({ includeMock: mock });
  const allowed = sources.sources.flatMap((s) => s.feeds.filter((f) => f.status === "allowed").map((f) => `${s.id}: ${f.url}`));
  console.log(`[index] list ${sources.version}, allowed feeds: ${allowed.length ? allowed.join(", ") : "none"}`);
  // 2 s between requests to one origin (longer if robots Crawl-delay says so).
  const fetcher = new PolicyFetch(mock ? mockTransport : guardedTransport, mock ? 0 : 2000);
  const store = new IndexStore(path);
  const report = await collectFeeds({ sources, fetcher, store, log: console.log });
  for (const n of report.notFetched) console.log(`[index] not fetched (${n.status}): ${n.url} — ${n.reason}`);
  console.log(`[index] ${store.all().length} entries in ${path}; collecting since ${store.meta.startedAt ?? "(nothing collected yet)"}`);
}

main().catch((e) => {
  console.error("[index] failed:", (e as Error).message);
  process.exit(1);
});
