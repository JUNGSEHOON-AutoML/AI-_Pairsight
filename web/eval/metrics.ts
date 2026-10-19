// Pure scoring for the evaluation harness. No I/O.
import { VERDICTS, type Verdict } from "../lib/domain";

const MANIPULATED = new Set<Verdict>(["ai_generated", "edited", "miscontextualized"]);

/**
 * correct       prediction equals the label
 * abstain       label is decisive, prediction is 판단 불가 (not wrong, but counts against usefulness)
 * opposite      authentic ↔ any manipulated verdict: the "정답과 반대 판정" that must stay near zero
 * wrong_type    both manipulated, different kind (e.g. 편집 조작 labelled, 맥락 조작 predicted)
 * unfounded     label is 판단 불가 (even a human could not decide) but the system decided
 * error         the case did not run
 */
export type Outcome = "correct" | "abstain" | "opposite" | "wrong_type" | "unfounded" | "error";

export function classify(label: Verdict, predicted: Verdict | null): Outcome {
  if (predicted == null) return "error";
  if (predicted === label) return "correct";
  if (label === "inconclusive") return "unfounded";
  if (predicted === "inconclusive") return "abstain";
  if ((label === "authentic" && MANIPULATED.has(predicted)) || (MANIPULATED.has(label) && predicted === "authentic")) return "opposite";
  return "wrong_type";
}

export interface ScoredRow {
  id: string;
  label: Verdict;
  predicted: Verdict | null;
}

export interface Summary {
  total: number;
  ran: number;
  distribution: Record<Verdict, number>;
  inconclusiveRate: number; // share of ran cases predicted 판단 불가
  outcomes: Record<Outcome, number>;
  decisiveAccuracy: number | null; // correct / decisive predictions (excludes 판단 불가)
  confusion: Record<Verdict, Record<Verdict, number>>; // [label][predicted]
  byOutcome: Record<Outcome, string[]>; // case ids
}

export function summarize(rows: ScoredRow[]): Summary {
  const zero = () => Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  const distribution = zero();
  const confusion = Object.fromEntries(VERDICTS.map((v) => [v, zero()])) as Summary["confusion"];
  const outcomes: Record<Outcome, number> = { correct: 0, abstain: 0, opposite: 0, wrong_type: 0, unfounded: 0, error: 0 };
  const byOutcome: Record<Outcome, string[]> = { correct: [], abstain: [], opposite: [], wrong_type: [], unfounded: [], error: [] };
  let ran = 0, decisive = 0, decisiveCorrect = 0;
  for (const r of rows) {
    const o = classify(r.label, r.predicted);
    outcomes[o]++;
    byOutcome[o].push(r.id);
    if (r.predicted == null) continue;
    ran++;
    distribution[r.predicted]++;
    confusion[r.label][r.predicted]++;
    if (r.predicted !== "inconclusive") {
      decisive++;
      if (r.predicted === r.label) decisiveCorrect++;
    }
  }
  return {
    total: rows.length,
    ran,
    distribution,
    inconclusiveRate: ran ? distribution.inconclusive / ran : 0,
    outcomes,
    decisiveAccuracy: decisive ? decisiveCorrect / decisive : null,
    confusion,
    byOutcome,
  };
}

export interface EvalCase {
  id: string;
  image: string; // path relative to the cases file
  claim: string; // what the post claims; may be empty
  claimedDate: string | null; // YYYY-MM-DD the post says it was taken, if any
  label: Verdict;
  source: string; // where the ground truth comes from (fact-check URL, original article, ...)
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
  const label = str("label") as Verdict;
  if (!VERDICTS.includes(label)) throw new Error(`line ${lineNo}: label must be one of ${VERDICTS.join(", ")}`);
  const claimedDate = str("claimedDate", false) || null;
  if (claimedDate && !/^\d{4}-\d{2}-\d{2}$/.test(claimedDate)) throw new Error(`line ${lineNo}: claimedDate must be YYYY-MM-DD`);
  const claim = str("claim", false);
  if ([...claim].length > 200) throw new Error(`line ${lineNo}: claim is longer than 200 characters (the app's limit)`);
  return { id: str("id"), image: str("image"), claim, claimedDate, label, source: str("source", false) };
}
