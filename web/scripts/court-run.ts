// Runs one fixture through the real pipeline (mock transport, fictional pages), the judge (rules v3) and the
// courtroom layer, then prints the judgment and timings.
//   npx tsx scripts/court-run.ts --mock
//   npx tsx scripts/court-run.ts --model qwen2.5:7b [--url http://127.0.0.1:11434] [--threads 8] [--json out.json]
import { readFile, writeFile } from "node:fs/promises";
import { runCourt } from "../lib/court/court";
import { MockLLMProvider } from "../lib/llm/mock";
import { OllamaProvider } from "../lib/llm/ollama";
import { createFreeProviders } from "../lib/providers";
import { decideVerdict } from "../lib/verdict";
import { collectEvidence } from "../lib/verification/engine";
import { mockTransport } from "../lib/verification/mock";
import { loadTrustedSources } from "../lib/verification/trusted-sources";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const signal = AbortSignal.timeout(30 * 60_000);
  const p = {
    ...createFreeProviders(mockTransport, "/nonexistent/index.jsonl"),
    reverseSearch: { name: "fixed", search: async () => ({ candidates: [{ url: "https://wire.example.test/2021/04/old-house", provider: "fixed" }], searchedProviders: ["고정 후보"] }) },
  };
  const input = await p.input.normalize({ bytes: new Uint8Array(await readFile("public/fixtures/inputs/trusted_edited.png")), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal);
  const c = await collectEvidence(input, p, signal);
  const verdict = decideVerdict({ evidence: c.evidence, matches: c.matches, claimedDate: null, trustedSources: loadTrustedSources({ includeMock: true }) });
  const llm = process.argv.includes("--mock")
    ? new MockLLMProvider()
    : new OllamaProvider({ baseUrl: arg("--url"), model: arg("--model"), numThread: arg("--threads") ? Number(arg("--threads")) : undefined });
  const started = performance.now();
  const r = await runCourt({ verdict, evidence: c.evidence, matches: c.matches }, llm, signal);
  const wallMs = Math.round(performance.now() - started);
  const summary = {
    llm: llm.name, judge: `${verdict.verdict} (${verdict.rule})`, final: r.finalVerdict, downgraded: r.downgraded,
    calls: r.llmCalls, wallMs, perCallMs: r.llmCalls ? Math.round(wallMs / r.llmCalls) : 0,
    kept: { prosecution: r.prosecution.length, defense: r.defense.length, jurorDoubts: r.jurors.filter((j) => j.doubt).length },
    rejected: r.rejected.length, incomplete: r.incomplete, clerkWritten: r.judgment.clerkWritten,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n" + r.judgment.headline);
  for (const a of r.prosecution) console.log(`검사 ${a.id} [${a.cite.join(",")}] ${a.text}`);
  for (const a of r.defense) console.log(`변호 ${a.id} ${a.kind} [${a.cite.join(",")}] ${a.text}`);
  for (const j of r.jurors) console.log(`배심원 ${j.juror}: ${j.decision}${j.doubt ? ` (${j.doubt.kind} [${j.doubt.cite.join(",")}] ${j.doubt.text})` : ""}`);
  for (const x of r.rejected) console.log(`폐기 ${x.role}: ${x.reason} — ${x.text}`);
  const out = arg("--json");
  if (out) await writeFile(out, JSON.stringify({ summary, record: r }, null, 2));
}
main();
