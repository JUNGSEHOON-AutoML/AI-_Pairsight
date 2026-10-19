// The RSS hash index on disk: one JSON line per article image + a small meta file.
// Stored: article URL, publication date, image URL, hashes, collection time. Never image bytes or article text.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ImageHashes } from "./hashes";

/** v2 = full + multi-scale crop hashes. Lines in an older format are skipped (re-collect to rebuild). */
export const INDEX_FORMAT = 2;

export interface IndexEntry {
  v: 2;
  sourceId: string;
  articleUrl: string;
  publishedAt: string | null;
  imageUrl: string;
  hashes: ImageHashes;
  collectedAt: string;
}

export interface FeedRun {
  url: string;
  at: string;
  added: number;
  skipped: number;
  stoppedReason: string | null;
}

export interface IndexMeta {
  startedAt: string | null; // first successful collection: "photos published before this cannot be found"
  runs: Record<string, FeedRun>; // last run per feed URL
}

export const DEFAULT_INDEX_PATH = () => process.env.PAIRSIGHT_RSS_INDEX ?? join(process.cwd(), ".data", "rss-index.jsonl");
const metaPath = (indexPath: string) => indexPath.replace(/\.jsonl$/, "") + ".meta.json";

export class IndexStore {
  private entries: IndexEntry[] = [];
  private keys = new Set<string>();
  skippedOldFormat = 0; // lines from an older index format, ignored
  meta: IndexMeta = { startedAt: null, runs: {} };

  constructor(readonly path: string) {
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as IndexEntry;
        if (e.v !== INDEX_FORMAT || !Array.isArray(e.hashes?.crops)) {
          this.skippedOldFormat++;
          continue;
        }
        this.entries.push(e);
        this.keys.add(this.key(e));
      }
    }
    if (existsSync(metaPath(path))) this.meta = JSON.parse(readFileSync(metaPath(path), "utf8"));
  }

  private key(e: Pick<IndexEntry, "articleUrl" | "imageUrl">) {
    return `${e.articleUrl}\n${e.imageUrl}`;
  }

  has(articleUrl: string, imageUrl: string) {
    return this.keys.has(this.key({ articleUrl, imageUrl }));
  }

  add(e: IndexEntry) {
    if (this.keys.has(this.key(e))) return false;
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(e) + "\n");
    this.entries.push(e);
    this.keys.add(this.key(e));
    return true;
  }

  recordRun(run: FeedRun) {
    this.meta.runs[run.url] = run;
    if (!this.meta.startedAt && run.added > 0) this.meta.startedAt = run.at;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(metaPath(this.path), JSON.stringify(this.meta, null, 2));
  }

  all(): readonly IndexEntry[] {
    return this.entries;
  }
}
