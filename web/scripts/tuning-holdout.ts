// Human-only entry point; never imported/called by the loop or automated tests.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { digest, inventory, loadCases, manifestPath } from "../eval/tuning/dataset";

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Holdout requires a human in an interactive terminal");
  const mode = process.argv[2];
  if (!["--seal", "--evaluate"].includes(mode)) throw new Error("Choose --seal or --evaluate");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try { answer = await rl.question("사람만 실행: holdout은 재튜닝에 사용하지 않습니다. 실행하려면 HOLDOUT 입력: "); } finally { rl.close(); }
  if (answer !== "HOLDOUT") throw new Error("Cancelled");
  const root = resolve(process.cwd(), "..");
  const cases = loadCases(root, "holdout");
  if (!cases.length) throw new Error("Holdout is empty");
  if (mode === "--seal") {
    writeFileSync(resolve(root, "tuning/datasets/holdout.inventory.json"), JSON.stringify(inventory(cases, digest(readFileSync(manifestPath(root, "holdout")))), null, 2));
    console.log("Holdout inventory sealed; no labels or evaluation results disclosed");
  } else {
    const { evaluate } = await import("../eval/tuning/evaluate");
    console.log(JSON.stringify(await evaluate(root, "holdout")));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "Holdout refused"); process.exitCode = 1; });
