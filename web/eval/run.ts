// Evaluation harness: real cases → the app's pipeline → v2 and v3 verdicts → report.
// Usage (from web/):
//   npm run eval -- --cases eval/cases.jsonl --validate        check the file and images, no network
//   npm run eval -- --cases eval/cases.jsonl [--out dir] [--mock] [--limit 20] [--only id]
// Live mode needs GOOGLE_VISION_API_KEY in the environment; without it the harness runs on mock providers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { VERDICT_LABEL } from "../lib/domain";
import { decideVerdict, sortEvidence } from "../lib/verdict";
import { collectEvidence, compareContext } from "../lib/verification/engine";
import { EMPTY_TRUSTED_LIST, findTrustedSource, loadTrustedSources, type TrustedSourceList } from "../lib/verification/trusted-sources";
import { type EvalCase, LABELS, type Label, parseCases } from "./metrics";
import { CANDIDATE_SOURCE_LABEL, pickProviders, type ProviderChoice, providersForCase } from "./providers";
import { buildReport, type CaseResult } from "./report";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };
const CASE_TIMEOUT_MS = 120_000;
export const PILOT_MIX: Record<Label, number> = { edited: 10, miscontextualized: 10, authentic: 5, ai_generated: 5 };

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return {
    cases: get("--cases") ?? "eval/cases.jsonl",
    out: get("--out") ?? `eval/out/${stamp}`,
    forceMock: a.includes("--mock"),
    validate: a.includes("--validate"),
    limit: get("--limit") ? Number(get("--limit")) : Infinity,
    only: get("--only"),
  };
}

const imagePath = (c: EvalCase, baseDir: string) => (isAbsolute(c.image) ? c.image : resolve(baseDir, c.image));

/** Problems that would make a case fail or mislead, found without touching the network. */
function validate(cases: EvalCase[], baseDir: string) {
  const problems: string[] = [];
  const counts = Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>;
  for (const c of cases) {
    counts[c.label]++;
    const p = imagePath(c, baseDir);
    if (!MIME[extname(p).toLowerCase()]) problems.push(`${c.id}: 지원하지 않는 이미지 형식 ${extname(p) || "(확장자 없음)"}`);
    else if (!existsSync(p)) problems.push(`${c.id}: 이미지 파일이 없어요 (${c.image})`);
    if (c.label === "miscontextualized" && !c.claimedDate) problems.push(`${c.id}: 맥락 조작 사례에 claimedDate가 없어요. 날짜가 없으면 v3 맥락 규칙이 동작할 수 없어요.`);
    if (!c.source) problems.push(`${c.id}: source(정답 근거)가 비어 있어요.`);
  }
  return { problems, counts, manual: cases.filter((c) => c.sourceUrls.length).length };
}

async function runCase(c: EvalCase, baseDir: string, choice: ProviderChoice, trusted: TrustedSourceList): Promise<CaseResult> {
  const { providers, source: candidateSource } = providersForCase(choice, c);
  const base: CaseResult = { id: c.id, label: c.label, source: c.source, claim: c.claim, claimedDate: c.claimedDate, candidateSource, sourceUrls: c.sourceUrls.map((s) => s.url) };
  const path = imagePath(c, baseDir);
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) return { ...base, error: `unsupported image type: ${extname(path)}` };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch {
    return { ...base, error: `image not found: ${c.image}` };
  }
  const signal = AbortSignal.timeout(CASE_TIMEOUT_MS);
  try {
    const input = await providers.input.normalize({ bytes, mime, pageUrl: null, publicImageUrl: null }, signal);
    const collected = await collectEvidence(input, providers, signal);
    const context = await compareContext({ text: c.claim, date: c.claimedDate }, collected, providers, signal);
    const evidence = [...collected.evidence, ...context];
    const verdictInput = { evidence, matches: collected.matches, claimedDate: c.claimedDate, claimText: c.claim };
    const v2 = decideVerdict({ ...verdictInput, trustedSources: EMPTY_TRUSTED_LIST });
    const v3 = decideVerdict({ ...verdictInput, trustedSources: trusted });
    return {
      ...base,
      v2: { verdict: v2.verdict, rule: v2.rule },
      v3,
      // Every evidence card, without raw details: kind, outcome, strength, summary, source.
      evidence: sortEvidence(evidence).map(({ kind, outcome, strength, summary, sourceUrl, provider, score }) => ({ kind, outcome, strength, summary, sourceUrl, provider, score })),
      candidates: {
        verified: collected.matches.length,
        matched: collected.matches.filter((m) => m.comparison?.matched).length,
        trusted: collected.matches.filter((m) => findTrustedSource(m.url, trusted)).length,
        searched: collected.searchedProviders,
      },
      // No thumbnails, heatmaps or page text in the output: numbers, URLs and dates only.
      matches: collected.matches.map((m) => ({
        url: m.url, trusted: findTrustedSource(m.url, trusted)?.name ?? null, date: m.firstSeenAt, dateSource: m.firstSeenSource,
        dateDisputed: !!m.dateDisputed, alignment: +(m.comparison?.alignmentScore ?? 0).toFixed(3),
        alignedDistance: m.comparison?.alignedDistance ?? -1, changedFraction: +(m.comparison?.changedFraction ?? 0).toFixed(3),
        regions: m.comparison?.diffRegions.length ?? 0,
      })),
      warnings: collected.verification.warnings,
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ...base, error: err.code ? `${err.code}: ${err.message ?? ""}` : (err.message ?? "unknown error") };
  }
}

async function main() {
  const opt = args();
  const cases = parseCases(readFileSync(opt.cases, "utf8"));
  const baseDir = dirname(resolve(opt.cases));

  if (opt.validate) {
    const { problems, counts, manual } = validate(cases, baseDir);
    console.log(`[eval] ${cases.length}건: ` + LABELS.map((l) => `${VERDICT_LABEL[l]} ${counts[l]}/${PILOT_MIX[l]}`).join(" · ") + " (파일럿 권장 구성 대비)");
    console.log(`[eval] 수동 후보(sourceUrls)가 있는 사례 ${manual}건 · 없는 사례 ${cases.length - manual}건 (없는 사례는 색인 또는 '검색 안 함'으로 평가)`);
    for (const p of problems) console.log(`[eval] 확인 필요: ${p}`);
    console.log(problems.length ? `[eval] 문제 ${problems.length}건` : "[eval] 문제 없음");
    process.exit(problems.some((p) => p.includes("이미지")) ? 1 : 0);
  }

  const selected = cases.filter((c) => !opt.only || c.id === opt.only).slice(0, opt.limit);
  const choice = pickProviders({ forceMock: opt.forceMock });
  const { mode } = choice;
  const trusted = loadTrustedSources({ includeMock: mode === "mock" });
  console.log(`[eval] mode=${mode} cases=${selected.length} trusted=${trusted.version} 기본 후보 출처=${CANDIDATE_SOURCE_LABEL[choice.defaultSource]}`);
  if (mode === "mock") console.log("[eval] --mock: 합성 fixture 전용 모드예요. 실제 사진에는 의미가 없어요.");

  const results: CaseResult[] = [];
  for (const [i, c] of selected.entries()) {
    const r = await runCase(c, baseDir, choice, trusted);
    results.push(r);
    console.log(`[eval] ${i + 1}/${selected.length} ${c.id} [${r.candidateSource}]: label=${c.label} v2=${r.v2?.verdict ?? "-"} v3=${r.v3?.verdict ?? "-"} ${r.error ? "ERROR " + r.error : ""}`);
  }
  const { markdown, s2, s3 } = buildReport(mode, trusted.version, results);
  mkdirSync(opt.out, { recursive: true });
  writeFileSync(join(opt.out, "report.md"), markdown);
  writeFileSync(join(opt.out, "results.json"), JSON.stringify({ mode, trusted: trusted.version, summary: { v2: s2, v3: s3 }, results }, null, 2));
  console.log(`[eval] v3: 맞힘 ${s3.outcomes.correct} · 판단 불가 ${s3.outcomes.missed} · 오판 ${s3.outcomes.wrong} · 실행 실패 ${s3.outcomes.error}`);
  console.log(`[eval] wrote ${join(opt.out, "report.md")}`);
}

main().catch((e) => {
  console.error("[eval] failed:", (e as Error).message);
  process.exit(1);
});
