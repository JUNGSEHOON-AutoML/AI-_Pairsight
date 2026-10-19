import type { DateRecord } from "./types";

const priority = { page_meta: 0, wayback_first_capture: 1, search_discovered: 2 };
export function selectDate(dates: DateRecord[]) {
  const valid = dates.filter(d => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(d.value) && Number.isFinite(Date.parse(d.value)) &&
    new Date(d.value.slice(0, 10)).toISOString().slice(0, 10) === d.value.slice(0, 10) && Date.parse(d.value) <= Date.now());
  const sorted = [...valid].sort((a, b) => priority[a.source] - priority[b.source] || a.value.localeCompare(b.value));
  const selected = sorted[0] ?? null;
  // A publication claim later than a known capture, or inconsistent publication claims, is disputed.
  const disputed = selected?.source === "page_meta" && valid.some(d =>
    d.source === "page_meta" ? d.value.slice(0, 10) !== selected.value.slice(0, 10) : d.value < selected.value);
  return { selected, observations: sorted, disputed: Boolean(disputed) };
}
