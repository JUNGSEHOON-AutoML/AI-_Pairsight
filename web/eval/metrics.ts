// Pure scoring for the evaluation harness. No I/O.
// Ground truth is a fact about the image, so 판단 불가 is never a label: it is only something the system can answer.
import { VERDICTS, type Verdict } from "../lib/domain";

export const LABELS = ["authentic", "ai_generated", "edited", "miscontextualized"] as const;
export type Label = (typeof LABELS)[number];

/**
 * correct  the verdict equals the label
 * missed   the system answered 판단 불가 (no conclusion; not wrong, but a miss)
 * wrong    any decisive verdict that differs from the label, including the wrong kind of manipulation
 *          (e.g. an edited image judged 맥락 조작) — 오판
 * error    the case did not run
 */
export type Outcome = "correct" | "missed" | "wrong" | "error";
export const OUTCOME_LABEL: Record<Outcome, string> = { correct: "맞힘", missed: "판단 불가(놓침)", wrong: "오판", error: "실행 실패" };

export function classify(label: Label, predicted: Verdict | null): Outcome {
  if (predicted == null) return "error";
  if (predicted === label) return "correct";
  if (predicted === "inconclusive") return "missed";
  return "wrong";
}

export interface ScoredRow {
  id: string;
  label: Label;
  predicted: Verdict | null;
}

export interface LabelStats {
  n: number; // cases with this label (including errors)
  ran: number;
  correct: number;
  missed: number;
  wrong: number;
  error: number;
  correctRate: number | null; // correct / ran
  missedRate: number | null; // missed / ran
}

export interface Summary {
  total: number;
  ran: number;
  outcomes: Record<Outcome, number>;
  distribution: Record<Verdict, number>; // predicted verdicts
  byLabel: Record<Label, LabelStats>;
  confusion: Record<Label, Record<Verdict, number>>; // [label][predicted]
  byOutcome: Record<Outcome, string[]>; // case ids
}

export function summarize(rows: ScoredRow[]): Summary {
  const zeroV = () => Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  const outcomes: Record<Outcome, number> = { correct: 0, missed: 0, wrong: 0, error: 0 };
  const byOutcome: Record<Outcome, string[]> = { correct: [], missed: [], wrong: [], error: [] };
  const distribution = zeroV();
  const confusion = Object.fromEntries(LABELS.map((l) => [l, zeroV()])) as Summary["confusion"];
  const byLabel = Object.fromEntries(
    LABELS.map((l) => [l, { n: 0, ran: 0, correct: 0, missed: 0, wrong: 0, error: 0, correctRate: null, missedRate: null }]),
  ) as Record<Label, LabelStats>;
  for (const r of rows) {
    const o = classify(r.label, r.predicted);
    outcomes[o]++;
    byOutcome[o].push(r.id);
    const s = byLabel[r.label];
    s.n++;
    s[o]++;
    if (r.predicted == null) continue;
    s.ran++;
    distribution[r.predicted]++;
    confusion[r.label][r.predicted]++;
  }
  for (const s of Object.values(byLabel)) {
    s.correctRate = s.ran ? s.correct / s.ran : null;
    s.missedRate = s.ran ? s.missed / s.ran : null;
  }
  return { total: rows.length, ran: rows.length - outcomes.error, outcomes, distribution, byLabel, confusion, byOutcome };
}

/** A candidate page given by hand instead of a search (pilot mode). imageUrl picks one photo on a multi-photo page. */
export interface ManualSource {
  url: string;
  imageUrl?: string;
}
export const MAX_MANUAL_SOURCES = 5; // the engine verifies at most 5 candidates per request

export interface EvalCase {
  id: string;
  image: string; // path relative to the cases file
  claim: string; // what the post claims; may be empty
  claimedDate: string | null; // YYYY-MM-DD the post says it was taken, if any
  label: Label;
  source: string; // where the ground truth comes from (original article, fact-check URL, ...)
  sourceUrls: ManualSource[]; // empty = use the search/index; non-empty = skip search, verify these pages
}

const httpUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    // Same rule as the app: no credential-looking query parameters in anything that is fetched or stored.
    if ([...u.searchParams.keys()].some((k) => /token|signature|credential|api.?key/i.test(k))) return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
};

function parseSourceUrls(raw: unknown, lineNo: number): ManualSource[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error(`line ${lineNo}: "sourceUrls" must be an array`);
  if (raw.length > MAX_MANUAL_SOURCES) throw new Error(`line ${lineNo}: at most ${MAX_MANUAL_SOURCES} sourceUrls (the engine checks 5 candidates)`);
  const out: ManualSource[] = [];
  for (const [i, item] of raw.entries()) {
    const obj = typeof item === "string" ? { url: item } : (item as { url?: unknown; imageUrl?: unknown });
    const url = httpUrl(obj?.url);
    if (!url) throw new Error(`line ${lineNo}: sourceUrls[${i}] is not a public http(s) URL`);
    const imageUrl = obj.imageUrl == null ? undefined : httpUrl(obj.imageUrl);
    if (obj.imageUrl != null && !imageUrl) throw new Error(`line ${lineNo}: sourceUrls[${i}].imageUrl is not a public http(s) URL`);
    if (!out.some((s) => s.url === url)) out.push({ url, ...(imageUrl ? { imageUrl } : {}) });
  }
  return out;
}

/** Parses one JSONL line; throws a message that names the line. */
export function parseCase(line: string, lineNo: number): EvalCase {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new Error(`line ${lineNo}: not valid JSON`);
  }
  const str = (k: string, required = true) => {
    const v = raw[k];
    if (v == null || v === "") {
      if (required) throw new Error(`line ${lineNo}: "${k}" is required`);
      return "";
    }
    if (typeof v !== "string") throw new Error(`line ${lineNo}: "${k}" must be a string`);
    return v;
  };
  const label = str("label");
  if (label === "inconclusive") {
    throw new Error(`line ${lineNo}: "inconclusive" is not a ground-truth label. Use the fact (${LABELS.join(", ")}) or leave the case out.`);
  }
  if (!LABELS.includes(label as Label)) throw new Error(`line ${lineNo}: label must be one of ${LABELS.join(", ")}`);
  const claimedDate = str("claimedDate", false) || null;
  if (claimedDate && !/^\d{4}-\d{2}-\d{2}$/.test(claimedDate)) throw new Error(`line ${lineNo}: claimedDate must be YYYY-MM-DD`);
  const claim = str("claim", false);
  if ([...claim].length > 200) throw new Error(`line ${lineNo}: claim is longer than 200 characters (the app's limit)`);
  return { id: str("id"), image: str("image"), claim, claimedDate, label: label as Label, source: str("source", false), sourceUrls: parseSourceUrls(raw.sourceUrls, lineNo) };
}

/** Parses a whole JSONL file. Blank lines and lines starting with // are skipped. Duplicate ids are an error. */
export function parseCases(text: string): EvalCase[] {
  const cases: EvalCase[] = [];
  const ids = new Set<string>();
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("//")) return;
    const c = parseCase(t, i + 1);
    if (ids.has(c.id)) throw new Error(`line ${i + 1}: duplicate id ${c.id}`);
    ids.add(c.id);
    cases.push(c);
  });
  return cases;
}
