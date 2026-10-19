// Scaffold only. Not started automatically by any app, cron, test or benchmark.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readDevReadiness, runRatchet } from "../eval/tuning/ratchet";

async function main() {
  const root = resolve(process.cwd(), "..");
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--check") {
    console.log(JSON.stringify(readDevReadiness(root))); return;
  }
  const arg = (key: string) => args[args.indexOf(key) + 1];
  if (!args.includes("--run") || !args.includes("--proposals") || !args.includes("--budget-seconds") || !args.includes("--max-experiments"))
    throw new Error("Use --check, or --run --proposals FILE --budget-seconds N --max-experiments N");
  const proposals = JSON.parse(readFileSync(arg("--proposals"), "utf8"));
  if (!Array.isArray(proposals)) throw new Error("Proposals must be a JSON array of threshold objects");
  console.log(JSON.stringify(await runRatchet({ root, proposals, budgetSeconds: Number(arg("--budget-seconds")), maxExperiments: Number(arg("--max-experiments")) })));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "Tuning refused"); process.exitCode = 1; });
