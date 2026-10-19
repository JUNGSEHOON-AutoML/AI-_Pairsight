// Fresh production comparisons, fixed offline evidence snapshots, no external fetching or LLM.
// Called by the runner for DEV ONLY; holdout has a separate interactive human entry point.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decideVerdict } from "../../lib/verdict";
import { LocalImageComparisonProvider } from "../../lib/verification/image-comparison";
import { loadTrustedSources } from "../../lib/verification/trusted-sources";
import { assetBytes, loadCases, type Split } from "./dataset";
import type { Score } from "./policy";

export async function evaluate(root: string, split: Split): Promise<Score> {
  const cases = loadCases(root, split);
  if (!cases.length) throw new Error("Empty evaluation split");
  const provider = new LocalImageComparisonProvider(), trustedSources = loadTrustedSources();
  const score: Score = { total: cases.length, correct: 0, wrong: 0, inconclusive: 0 };
  for (const c of cases) {
    const input = assetBytes(root, split, c.input), matches = [];
    for (const r of c.references) {
      const comparison = await provider.compare(input, assetBytes(root, split, r.image), AbortSignal.timeout(120_000));
      matches.push({ ...r.match, comparison, diffRegions: comparison.diffRegions });
    }
    const result = decideVerdict({ evidence: c.evidence, matches, claimedDate: c.claimedDate, claimText: c.claimText, trustedSources });
    if (result.verdict === "inconclusive") score.inconclusive++;
    else if (result.verdict === c.label) score.correct++;
    else score.wrong++;
  }
  return score;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Intentionally no --split argument. Automated evaluation is always dev.
  if (process.argv.length !== 2) throw new Error("Automated evaluator accepts no split override");
  evaluate(resolve(process.cwd(), ".."), "dev").then((score) => console.log(JSON.stringify(score)))
    .catch(() => { console.error("Dev evaluation failed; no score accepted"); process.exitCode = 1; });
}
