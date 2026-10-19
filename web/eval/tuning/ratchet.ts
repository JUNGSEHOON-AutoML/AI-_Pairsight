import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseThresholds } from "../../lib/verification/thresholds";
import { digest, inventory, loadCases, manifestPath, requireReady, type Inventory } from "./dataset";
import { accepts, validScore, type Score } from "./policy";

export const MUTABLE = "tuning/thresholds.json";
const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
export const tracked = (root: string) => git(root, ["ls-files", "-z"]).split("\0").filter(Boolean).sort();
export function snapshot(root: string): Record<string, string> {
  return Object.fromEntries(tracked(root).filter((p) => p !== MUTABLE).map((p) => {
    if (/(^|\/)\.env(?:\.local|\.production(?:\.local)?|\.development(?:\.local)?)?$/.test(p)) throw new Error("Refusing tracked secret file");
    const path = resolve(root, p);
    if (!lstatSync(path).isFile()) throw new Error("Protected files must be regular files");
    return [p, digest(readFileSync(path))];
  }));
}
export function assertIntegrity(root: string, locked: Record<string, string>) {
  const current = snapshot(root);
  if (JSON.stringify(current) !== JSON.stringify(locked)) throw new Error("Protected file changed; tuning stopped");
  const changed = git(root, ["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  if (changed.some((p) => p !== MUTABLE) || untracked) throw new Error("Only tuning/thresholds.json may change");
}
export function checkBranch(root: string) {
  if (!/^tuning\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(git(root, ["symbolic-ref", "--short", "HEAD"]))) throw new Error("Only tuning/* branches are allowed");
}
function clean(root: string) {
  checkBranch(root);
  if (git(root, ["status", "--porcelain"])) throw new Error("A clean dedicated worktree is required");
}
/** Kills the whole command group on deadline or any protected-file write, including transient writes. */
export async function command(root: string, executable: string, args: string[], deadline: number, locked: Record<string, string>) {
  assertIntegrity(root, locked);
  if (Date.now() >= deadline) throw new Error("Experiment time budget exceeded");
  return new Promise<string>((done, fail) => {
    let output = "", reason: Error | null = null;
    const stop = (message: string) => {
      reason ??= new Error(message);
      if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ } }
    };
    const watchers = Object.keys(locked).map((p) => watch(resolve(root, p), () => stop("Protected file changed; tuning stopped")));
    const child = spawn(executable, args, { cwd: resolve(root, "web"), detached: true,
      env: { ...process.env, GEMINI_API_KEY: "", PAIRSIGHT_LLM: "mock" }, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => stop("Experiment time budget exceeded"), Math.max(1, deadline - Date.now()));
    const cleanup = () => { clearTimeout(timer); watchers.forEach((w) => w.close()); };
    child.stdout?.on("data", (b) => { if (output.length < 1_000_000) output += b.toString(); });
    // Do not forward subprocess stderr or environment to logs.
    child.stderr?.on("data", () => {});
    child.on("error", () => { cleanup(); fail(new Error("Experiment command could not start")); });
    child.on("close", (code) => {
      cleanup();
      try { assertIntegrity(root, locked); } catch { reason = new Error("Protected file changed; tuning stopped"); }
      if (reason) fail(reason);
      else if (code !== 0) fail(new Error("Experiment command failed"));
      else done(output);
    });
  });
}
export function readDevReadiness(root: string) {
  const dev = inventory(loadCases(root, "dev"), digest(readFileSync(manifestPath(root, "dev"))));
  // Do not parse holdout cases; human sealing emits only non-label inventory.
  if (dev.independentRealPhotos < 30) throw new Error("Refusing tuning: need at least 30 independent real-photo dev cases");
  const seal = resolve(root, "tuning/datasets/holdout.inventory.json");
  if (!existsSync(seal)) throw new Error("Refusing tuning: manually sealed holdout required");
  const holdout = JSON.parse(readFileSync(seal, "utf8")) as Inventory;
  requireReady(dev, holdout, digest(readFileSync(manifestPath(root, "holdout"))));
  return dev;
}
/** Only a known, newly-created candidate may be reset; never a user's unrelated work. */
export function rollback(root: string, accepted: string, candidate: string, locked: Record<string, string>) {
  checkBranch(root); assertIntegrity(root, locked);
  if (git(root, ["rev-parse", "HEAD"]) !== candidate || git(root, ["rev-parse", `${candidate}^`]) !== accepted ||
    git(root, ["diff", "--name-only", accepted, candidate]) !== MUTABLE) throw new Error("Unsafe rollback refused");
  git(root, ["reset", "--hard", accepted]);
}
export interface RatchetOptions { root: string; proposals: unknown[]; budgetSeconds: number; maxExperiments: number }
export async function runRatchet({ root, proposals, budgetSeconds, maxExperiments }: RatchetOptions) {
  if (!Number.isSafeInteger(budgetSeconds) || budgetSeconds <= 0 || !Number.isSafeInteger(maxExperiments) || maxExperiments <= 0)
    throw new Error("Positive integer time budget and experiment count required");
  // All preconditions precede any writes, commits, tests or evaluation.
  clean(root);
  const dev = readDevReadiness(root);
  const locked = snapshot(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = resolve(root, git(root, ["rev-parse", "--git-path", `pairsight-tuning/${stamp}`]));
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resolve(runDir, "protected-hashes.json"), JSON.stringify(locked, null, 2));
  const run = (args: string[], deadline: number) => command(root, process.execPath, args, deadline, locked);
  const tests = (deadline: number) => run(["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=2"], deadline);
  const evaluate = async (deadline: number): Promise<Score> => {
    const out = await run(["--import", "tsx", "eval/tuning/evaluate.ts"], deadline);
    const score = JSON.parse(out.trim()) as Score;
    if (!validScore(score) || score.total !== dev.cases) throw new Error("Invalid evaluator output");
    return score;
  };
  // Baseline uses the same bounded tests/evaluator. A wrong baseline does not authorize a wrong candidate.
  const baselineDeadline = Date.now() + budgetSeconds * 1000;
  await tests(baselineDeadline);
  let best = await evaluate(baselineDeadline);
  let accepted = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(resolve(runDir, "baseline.json"), JSON.stringify({ commit: accepted, score: best }));
  for (let i = 0; i < Math.min(proposals.length, maxExperiments); i++) {
    clean(root); assertIntegrity(root, locked);
    const deadline = Date.now() + budgetSeconds * 1000;
    const value = parseThresholds(proposals[i]);
    writeFileSync(resolve(root, MUTABLE), JSON.stringify(value, null, 2) + "\n");
    if (!git(root, ["diff", "--name-only"])) continue;
    assertIntegrity(root, locked);
    git(root, ["add", "--", MUTABLE]);
    git(root, ["commit", "-m", `tuning: candidate ${i + 1}`]); // always commit BEFORE evaluation
    const candidate = git(root, ["rev-parse", "HEAD"]);
    let score: Score | null = null, adopted = false, error: string | null = null;
    try {
      await tests(deadline); // failed tests never reach the evaluator
      score = await evaluate(deadline);
      adopted = accepts(best, score, true);
    } catch (e) {
      error = e instanceof Error ? e.message : "Experiment failed";
      // Integrity violations stop immediately; leave evidence for human inspection, no blind reset.
      if (error.includes("Protected") || error.includes("Only tuning")) throw e;
    }
    writeFileSync(resolve(runDir, `${i + 1}.json`), JSON.stringify({ candidate, score, adopted, error }));
    if (adopted) { best = score!; accepted = candidate; }
    else rollback(root, accepted, candidate, locked);
  }
  return { accepted, score: best, runDir };
}
