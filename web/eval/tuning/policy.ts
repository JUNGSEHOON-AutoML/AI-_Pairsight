export interface Score { total: number; correct: number; wrong: number; inconclusive: number }
export function validScore(s: Score) {
  return [s.total, s.correct, s.wrong, s.inconclusive].every((n) => Number.isSafeInteger(n) && n >= 0) &&
    s.total > 0 && s.correct + s.wrong + s.inconclusive === s.total;
}
export function accepts(baseline: Score, candidate: Score, allTestsPassed: boolean): boolean {
  if (!allTestsPassed || !validScore(baseline) || !validScore(candidate) || candidate.total !== baseline.total) return false;
  if (candidate.wrong !== 0) return false;
  return candidate.correct > baseline.correct || (candidate.correct === baseline.correct && candidate.inconclusive < baseline.inconclusive);
}
