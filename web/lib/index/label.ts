// Pure strings for the RSS index (safe to import from client components).

/** "신뢰 출처 RSS 색인 (2026-10-19부터 수집)": shown as 검색한 곳, and the hook for the coverage note. */
export function indexLabel(startedAt: string | null) {
  return startedAt ? `신뢰 출처 RSS 색인 (${startedAt.slice(0, 10)}부터 수집)` : "신뢰 출처 RSS 색인 (아직 수집 전)";
}
export const isIndexLabel = (label: string) => label.startsWith("신뢰 출처 RSS 색인");

/** The limit users must see whenever the index was the search (replica/rss-hash-index.md, 한계). */
export const INDEX_COVERAGE_NOTE =
  "신뢰 출처 RSS 색인은 수집을 시작한 날 이후 신뢰 출처 기사에 실린 사진만 찾아요. 그 전에 게시된 사진이나 다른 곳에만 있는 사진은 찾을 수 없어요.";
