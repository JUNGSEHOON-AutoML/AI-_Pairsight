// Trusted-source list for verdict rules v3 (replica/trusted-sources.md).
// The list lives in config/trusted-sources.json so editors can change it without touching code.
// It is re-read when the file's modification time changes. An invalid file fails closed: an empty
// list, which means v3 adds nothing and the v2 rules decide alone.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type TrustedCategory = "kr_wire" | "kr_press" | "kr_broadcast" | "intl_wire" | "government";
const CATEGORIES: TrustedCategory[] = ["kr_wire", "kr_press", "kr_broadcast", "intl_wire", "government"];

/** An official RSS feed and whether we may collect it (replica/rss-collection-checklist.md). */
export type FeedStatus = "allowed" | "excluded" | "pending";
export interface TrustedFeed {
  url: string;
  status: FeedStatus; // only "allowed" feeds are ever fetched by the collector
  reason: string;
  evidence: string | null; // URL of the terms/RSS guide the decision is based on
  checkedAt: string | null; // YYYY-MM-DD
}

export interface TrustedSource {
  id: string;
  name: string;
  domains: string[]; // registrable domains or public suffixes such as go.kr; subdomains match too
  category: TrustedCategory;
  basis: string;
  feeds: TrustedFeed[];
}

export interface TrustedSourceList {
  version: string;
  sources: TrustedSource[];
}

export const EMPTY_TRUSTED_LIST: TrustedSourceList = { version: "empty", sources: [] };

const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Throws with a readable message when the file does not match the schema. */
export function parseTrustedList(raw: unknown, origin = "trusted-sources"): TrustedSourceList {
  const fail = (why: string): never => { throw new Error(`${origin}: ${why}`); };
  if (!raw || typeof raw !== "object") fail("not a JSON object");
  const obj = raw as { version?: unknown; sources?: unknown };
  if (typeof obj.version !== "string" || !obj.version) fail("missing version");
  if (!Array.isArray(obj.sources)) fail("sources must be an array");
  const ids = new Set<string>();
  const sources = (obj.sources as unknown[]).map((s, i) => {
    const e = s as Partial<TrustedSource>;
    if (typeof e.id !== "string" || !e.id || ids.has(e.id)) fail(`sources[${i}]: id missing or duplicated`);
    ids.add(e.id!);
    if (typeof e.name !== "string" || !e.name) fail(`sources[${i}]: name missing`);
    if (!CATEGORIES.includes(e.category as TrustedCategory)) fail(`sources[${i}]: unknown category ${String(e.category)}`);
    if (!Array.isArray(e.domains) || e.domains.length === 0) fail(`sources[${i}]: domains missing`);
    const domains = e.domains!.map((d) => {
      const v = String(d).trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if (!DOMAIN.test(v)) fail(`sources[${i}]: invalid domain ${String(d)}`);
      return v;
    });
    const rawFeeds = (s as { feeds?: unknown }).feeds ?? [];
    if (!Array.isArray(rawFeeds)) fail(`sources[${i}]: feeds must be an array`);
    const feeds = (rawFeeds as unknown[]).map((f, j) => {
      const x = f as Partial<TrustedFeed>;
      let url: URL | null = null;
      try {
        url = new URL(String(x.url));
      } catch {}
      if (!url || !["http:", "https:"].includes(url.protocol)) fail(`sources[${i}].feeds[${j}]: invalid url`);
      if (!["allowed", "excluded", "pending"].includes(String(x.status))) fail(`sources[${i}].feeds[${j}]: status must be allowed, excluded or pending`);
      if (x.status === "allowed" && (!x.evidence || !x.checkedAt)) fail(`sources[${i}].feeds[${j}]: an allowed feed needs evidence and checkedAt`);
      return { url: url!.href, status: x.status as FeedStatus, reason: typeof x.reason === "string" ? x.reason : "",
        evidence: typeof x.evidence === "string" ? x.evidence : null, checkedAt: typeof x.checkedAt === "string" ? x.checkedAt : null };
    });
    return { id: e.id!, name: e.name!, domains, category: e.category as TrustedCategory, basis: typeof e.basis === "string" ? e.basis : "", feeds };
  });
  return { version: obj.version as string, sources };
}

/** Exact domain or a subdomain of it, on a dot boundary. yna.co.kr.evil.com and fakeyna.co.kr never match. */
export function findTrustedSource(url: string, list: TrustedSourceList): TrustedSource | null {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  for (const s of list.sources) {
    if (s.domains.some((d) => host === d || host.endsWith("." + d))) return s;
  }
  return null;
}

const CONFIG_DIR = () => join(process.cwd(), "config");
type Cached = { key: string; list: TrustedSourceList };
const g = globalThis as unknown as { __pairsightTrusted?: Cached };

function readList(path: string): TrustedSourceList {
  return parseTrustedList(JSON.parse(readFileSync(path, "utf8")), path);
}

/**
 * The list the running app uses. PAIRSIGHT_TRUSTED_SOURCES overrides the path.
 * In mock mode the fictional fixture domains are merged in.
 */
export function loadTrustedSources(opts: { includeMock?: boolean } = {}): TrustedSourceList {
  const main = process.env.PAIRSIGHT_TRUSTED_SOURCES ?? join(CONFIG_DIR(), "trusted-sources.json");
  const mock = join(CONFIG_DIR(), "trusted-sources.mock.json");
  const paths = opts.includeMock ? [main, mock] : [main];
  let key: string;
  try {
    key = paths.map((p) => `${p}@${statSync(p).mtimeMs}`).join("|");
  } catch (e) {
    console.error("trusted sources unavailable, falling back to v2 rules only:", (e as Error).message);
    return EMPTY_TRUSTED_LIST;
  }
  if (g.__pairsightTrusted?.key === key) return g.__pairsightTrusted.list;
  try {
    const lists = paths.map(readList);
    const list: TrustedSourceList = { version: lists.map((l) => l.version).join("+"), sources: lists.flatMap((l) => l.sources) };
    g.__pairsightTrusted = { key, list };
    return list;
  } catch (e) {
    console.error("trusted sources invalid, falling back to v2 rules only:", (e as Error).message);
    g.__pairsightTrusted = { key, list: EMPTY_TRUSTED_LIST };
    return EMPTY_TRUSTED_LIST;
  }
}
