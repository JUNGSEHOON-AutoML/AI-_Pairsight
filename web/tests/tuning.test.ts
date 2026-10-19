import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseThresholds, THRESHOLDS } from "../lib/verification/thresholds";
import { digest, inventory, requireReady, type TuningCase } from "../eval/tuning/dataset";
import { accepts } from "../eval/tuning/policy";
import { assertIntegrity, checkBranch, command, MUTABLE, readDevReadiness, rollback, snapshot } from "../eval/tuning/ratchet";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (root: string, ...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function repo() {
  const root = mkdtempSync(resolve(tmpdir(), "pairsight-tuning-test-")); dirs.push(root);
  mkdirSync(resolve(root, "tuning")); mkdirSync(resolve(root, "web"));
  writeFileSync(resolve(root, MUTABLE), JSON.stringify(THRESHOLDS));
  writeFileSync(resolve(root, "web/rules.txt"), "protected rule and label");
  git(root, "init"); git(root, "checkout", "-b", "tuning/unit-test");
  git(root, "config", "user.name", "Tuning test"); git(root, "config", "user.email", "tuning@example.invalid");
  git(root, "add", "."); git(root, "commit", "-m", "test baseline");
  return root;
}
const cases = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, independentCaseId: `${prefix}-${i}`,
  splitGroup: `${prefix}-camera-${i}`, realPhoto: true, input: { sha256: digest(`${prefix}-${i}`) }, references: [] }) as unknown as TuningCase);

describe("threshold ratchet policy (no real loop executed)", () => {
  it("enforces all tests → zero wrong → more correct → fewer inconclusive", () => {
    const baseline = { total: 30, correct: 10, wrong: 1, inconclusive: 19 };
    expect(accepts(baseline, { total: 30, correct: 29, wrong: 1, inconclusive: 0 }, true)).toBe(false);
    expect(accepts(baseline, { total: 30, correct: 20, wrong: 0, inconclusive: 10 }, false)).toBe(false);
    expect(accepts(baseline, { total: 30, correct: 11, wrong: 0, inconclusive: 19 }, true)).toBe(true);
    expect(accepts(baseline, { total: 30, correct: 10, wrong: 0, inconclusive: 20 }, true)).toBe(false);
    expect(accepts(baseline, { total: 29, correct: 29, wrong: 0, inconclusive: 0 }, true)).toBe(false);
    expect(accepts(baseline, { total: 30, correct: 30, wrong: -1, inconclusive: 1 }, true)).toBe(false);
    const best = { total: 30, correct: 20, wrong: 0, inconclusive: 10 };
    expect(accepts(best, best, true)).toBe(false);
  });
  it("refuses insufficient independent real cases, synthetic inflation and dev/holdout leakage", () => {
    const holdout = inventory(cases(3, "holdout"), "sealed");
    const make = (n: number) => inventory(cases(n, "dev"), "dev");
    expect(() => requireReady(make(29), holdout, "sealed")).toThrow(/30/);
    expect(() => requireReady(make(30), holdout, "sealed")).not.toThrow();
    expect(() => requireReady(make(30), holdout, "modified")).toThrow(/sealed/);
    const dupes = cases(60, "dev").map((c) => ({ ...c, independentCaseId: "one-photo" }));
    expect(inventory(dupes, "dev").independentRealPhotos).toBe(1);
    expect(inventory(cases(60, "synthetic").map((c) => ({ ...c, realPhoto: false })), "x").independentRealPhotos).toBe(0);
    expect(() => requireReady(make(30), inventory(cases(2, "dev"), "sealed"), "sealed")).toThrow(/overlap/);
    const empty = repo(); mkdirSync(resolve(empty, "tuning/datasets/dev"), { recursive: true });
    writeFileSync(resolve(empty, "tuning/datasets/dev/cases.json"), '{"version":1,"cases":[]}');
    expect(() => readDevReadiness(empty)).toThrow(/30/);
  });
  it("allows only numeric keys in a bounded domain, never rule-disable switches", () => {
    expect(parseThresholds(THRESHOLDS)).toEqual(THRESHOLDS);
    for (const bad of [{ ...THRESHOLDS, disableGuard: true }, { ...THRESHOLDS, maxDiffRegionCount: 1.5 },
      { ...THRESHOLDS, minSceneSimilarity: 0 }, { ...THRESHOLDS, maxOutsideResidual: NaN }]) expect(() => parseThresholds(bad)).toThrow();
  });
  it("locks evaluation, labels and rules; permits only the threshold file", () => {
    const root = repo(), lock = snapshot(root);
    writeFileSync(resolve(root, MUTABLE), "{}"); expect(() => assertIntegrity(root, lock)).not.toThrow();
    writeFileSync(resolve(root, "web/rules.txt"), "modified"); expect(() => assertIntegrity(root, lock)).toThrow(/Protected/);
  });
  it("refuses other branches and resets only a known threshold-only candidate commit", () => {
    const root = repo(), lock = snapshot(root), baseline = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-b", "main"); expect(() => checkBranch(root)).toThrow(/tuning/);
    git(root, "checkout", "tuning/unit-test");
    writeFileSync(resolve(root, MUTABLE), JSON.stringify({ ...THRESHOLDS, maxAlignedDistance: THRESHOLDS.maxAlignedDistance === 17 ? 18 : 17 }));
    git(root, "add", MUTABLE); git(root, "commit", "-m", "test candidate");
    const candidate = git(root, "rev-parse", "HEAD");
    rollback(root, baseline, candidate, lock);
    expect(git(root, "rev-parse", "HEAD")).toBe(baseline);
    expect(JSON.parse(readFileSync(resolve(root, MUTABLE), "utf8"))).toEqual(THRESHOLDS);
    expect(() => rollback(root, baseline, candidate, lock)).toThrow(/Unsafe/);
  });
  it("kills a running evaluator on budget exhaustion or protected-file writes", async () => {
    const root = repo(), lock = snapshot(root);
    await expect(command(root, process.execPath, ["-e", "setInterval(()=>{},1000)"], Date.now() + 200, lock)).rejects.toThrow(/budget/);
    await expect(command(root, process.execPath, ["-e", "require('node:fs').writeFileSync('rules.txt','tampered');setInterval(()=>{},1000)"], Date.now() + 5000, lock)).rejects.toThrow(/Protected/);
  });
  it("does not allow holdout evaluation in noninteractive automation", () => {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/tuning-holdout.ts", "--evaluate"], { encoding: "utf8", stdio: "pipe" }))
      .toThrow(/interactive terminal/);
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "eval/tuning/evaluate.ts", "--split", "holdout"], { encoding: "utf8", stdio: "pipe" }))
      .toThrow(/no split override/);
  });
});
