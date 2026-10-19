// Evaluation harness: real cases → the app's pipeline → v2 and v3 verdicts → report.
// Usage (from web/):  npm run eval -- --cases eval/cases.jsonl [--out eval/out/run1] [--mock] [--limit 20] [--only id]
// Live mode needs GOOGLE_VISION_API_KEY in the environment; without it the harness runs on mock providers.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { VERDICT_LABEL, type Verdict } from "../lib/domain";
import { decideVerdict, type VerdictResult } from "../lib/verdict";
import { collectEvidence, compareContext } from "../lib/verification/engine";
import { EMPTY_TRUSTED_LIST, findTrustedSource, loadTrustedSources } from "../lib/verification/trusted-sources";
import { classify, type EvalCase, parseCase, summarize } from "./metrics";
import { pickProviders } from "./providers";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };
const CASE_TIMEOUT_MS = 120_000;

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
    limit: get("--limit") ? Number(get("--limit")) : Infinity,
    only: get("--only"),
  };
}

interface CaseResult {
  id: string;
  label: Verdict;
  source: string;
  claim: string;
  claimedDate: string | null;
  error?: string;
  v2?: Pick<VerdictResult, "verdict" | "rule">;
  v3?: Omit<VerdictResult, "missing"> & { missing: string[] };
  candidates?: { verified: number; matched: number; trusted: number; searched: string[] };
  matches?: { url: string; trusted: string | null; date: string | null; dateSource: string | null; dateDisputed: boolean;
    alignment: number; alignedDistance: number; changedFraction: number; regions: number }[];
  warnings?: string[];
}

async function runCase(c: EvalCase, baseDir: string, providers: ReturnType<typeof pickProviders>["providers"], trusted: ReturnType<typeof loadTrustedSources>): Promise<CaseResult> {
  const base: CaseResult = { id: c.id, label: c.label, source: c.source, claim: c.claim, claimedDate: c.claimedDate };
  const path = isAbsolute(c.image) ? c.image : resolve(baseDir, c.image);
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
    const verdictInput = { evidence: [...collected.evidence, ...context], matches: collected.matches, claimedDate: c.claimedDate, claimText: c.claim };
    const v2 = decideVerdict({ ...verdictInput, trustedSources: EMPTY_TRUSTED_LIST });
    const v3 = decideVerdict({ ...verdictInput, trustedSources: trusted });
    return {
      ...base,
      v2: { verdict: v2.verdict, rule: v2.rule },
      v3,
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

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const v = (x: Verdict | null | undefined) => (x ? VERDICT_LABEL[x] : "—");

function report(mode: string, listVersion: string, results: CaseResult[]) {
  const s2 = summarize(results.map((r) => ({ id: r.id, label: r.label, predicted: r.v2?.verdict ?? null })));
  const s3 = summarize(results.map((r) => ({ id: r.id, label: r.label, predicted: r.v3?.verdict ?? null })));
  const lines: string[] = [];
  lines.push(`# 평가 결과 (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`, "");
  if (mode === "mock") {
    lines.push("> **MOCK 모드입니다.** 역이미지 검색 키가 없어서 모의 공급자로 돌렸어요. 실제 사진은 모두 '원본 없음'이 되므로 정확도와 무관해요. 하네스가 동작하는지만 확인한 결과예요.", "");
  }
  lines.push(`- 모드: **${mode}** · 사례 ${s3.total}건 (실행 ${s3.ran}건, 실패 ${s3.outcomes.error}건) · 신뢰 출처 목록 ${listVersion}`, "");
  lines.push("## 판정 분포", "", "| 판정 | v2 | v3 |", "| --- | --- | --- |");
  for (const k of Object.keys(s3.distribution) as Verdict[]) lines.push(`| ${VERDICT_LABEL[k]} | ${s2.distribution[k]} | ${s3.distribution[k]} |`);
  lines.push("", "| 지표 | v2 | v3 |", "| --- | --- | --- |");
  lines.push(`| 판단 불가 비율 | ${pct(s2.inconclusiveRate)} | ${pct(s3.inconclusiveRate)} |`);
  lines.push(`| 정답 | ${s2.outcomes.correct} | ${s3.outcomes.correct} |`);
  lines.push(`| 확정 판정의 정확도 (판단 불가 제외) | ${s2.decisiveAccuracy == null ? "—" : pct(s2.decisiveAccuracy)} | ${s3.decisiveAccuracy == null ? "—" : pct(s3.decisiveAccuracy)} |`);
  lines.push(`| **반대 판정** (진짜↔조작) | ${s2.outcomes.opposite} | **${s3.outcomes.opposite}** |`);
  lines.push(`| 조작 유형 혼동 | ${s2.outcomes.wrong_type} | ${s3.outcomes.wrong_type} |`);
  lines.push(`| 근거 없는 확정 (정답이 판단 불가) | ${s2.outcomes.unfounded} | ${s3.outcomes.unfounded} |`);
  lines.push(`| 보류 (정답은 확정, 판정은 판단 불가) | ${s2.outcomes.abstain} | ${s3.outcomes.abstain} |`);
  lines.push("");
  const byId = new Map(results.map((r) => [r.id, r]));
  const list = (title: string, ids: string[]) => {
    lines.push(`## ${title} (v3, ${ids.length}건)`, "");
    if (!ids.length) return lines.push("없음", "");
    lines.push("| 사례 | 정답 | v3 판정 | 규칙 | 핵심 발견 | 정답 출처 |", "| --- | --- | --- | --- | --- | --- |");
    for (const id of ids) {
      const r = byId.get(id)!;
      lines.push(`| ${id} | ${v(r.label)} | ${v(r.v3?.verdict)} | ${r.v3?.rule ?? r.error ?? ""} | ${r.v3?.headlineFinding?.text ?? "—"} | ${r.source || "—"} |`);
    }
    lines.push("");
  };
  list("오판: 반대 판정", s3.byOutcome.opposite);
  list("오판: 조작 유형 혼동", s3.byOutcome.wrong_type);
  list("근거 없는 확정", s3.byOutcome.unfounded);
  const changed = results.filter((r) => r.v2 && r.v3 && r.v2.verdict !== r.v3.verdict);
  lines.push(`## v2 → v3에서 바뀐 사례 (${changed.length}건)`, "");
  if (changed.length) {
    lines.push("| 사례 | 정답 | v2 | v3 | v3 결과 |", "| --- | --- | --- | --- | --- |");
    for (const r of changed) lines.push(`| ${r.id} | ${v(r.label)} | ${v(r.v2!.verdict)} | ${v(r.v3!.verdict)} (${r.v3!.rule}, ${r.v3!.strength ?? "-"}) | ${classify(r.label, r.v3!.verdict)} |`);
  } else lines.push("없음");
  lines.push("", "## 사례별 근거 요약", "", "| 사례 | 정답 | v3 | 강도 | 후보(확인/일치/신뢰) | 핵심 발견 · 부족한 근거 | 경고·오류 |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    const cand = r.candidates ? `${r.candidates.verified}/${r.candidates.matched}/${r.candidates.trusted}` : "—";
    const detail = r.v3 ? [r.v3.headlineFinding?.text, ...r.v3.missing].filter(Boolean).join(" · ") : "—";
    const warn = r.error ?? (r.warnings ?? []).join(" · ");
    lines.push(`| ${r.id} | ${v(r.label)} | ${v(r.v3?.verdict)} | ${r.v3?.strength ?? "—"} | ${cand} | ${detail.replaceAll("|", "/")} | ${warn.replaceAll("|", "/")} |`);
  }
  lines.push("", "혼동 행렬(v3, 행=정답, 열=판정)은 results.json의 `summary.v3.confusion`에 있어요.");
  return { markdown: lines.join("\n") + "\n", s2, s3 };
}

async function main() {
  const opt = args();
  const text = readFileSync(opt.cases, "utf8");
  const cases: EvalCase[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() && !line.trim().startsWith("//")) cases.push(parseCase(line, i + 1));
  });
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate case id: ${c.id}`);
    ids.add(c.id);
  }
  const selected = cases.filter((c) => !opt.only || c.id === opt.only).slice(0, opt.limit);
  const { mode, providers } = pickProviders({ forceMock: opt.forceMock });
  const trusted = loadTrustedSources({ includeMock: mode === "mock" });
  console.log(`[eval] mode=${mode} cases=${selected.length} trusted=${trusted.version}`);
  if (mode === "mock") console.log("[eval] GOOGLE_VISION_API_KEY not set (or --mock): results on real photos will all be 원본 없음.");

  const results: CaseResult[] = [];
  for (const [i, c] of selected.entries()) {
    const r = await runCase(c, dirname(resolve(opt.cases)), providers, trusted);
    results.push(r);
    console.log(`[eval] ${i + 1}/${selected.length} ${c.id}: label=${c.label} v2=${r.v2?.verdict ?? "-"} v3=${r.v3?.verdict ?? "-"} ${r.error ? "ERROR " + r.error : ""}`);
  }
  const { markdown, s2, s3 } = report(mode, trusted.version, results);
  mkdirSync(opt.out, { recursive: true });
  writeFileSync(join(opt.out, "report.md"), markdown);
  writeFileSync(join(opt.out, "results.json"), JSON.stringify({ mode, trusted: trusted.version, summary: { v2: s2, v3: s3 }, results }, null, 2));
  console.log(`[eval] v3: 판단 불가 ${pct(s3.inconclusiveRate)}, 반대 판정 ${s3.outcomes.opposite}, 근거 없는 확정 ${s3.outcomes.unfounded}`);
  console.log(`[eval] wrote ${join(opt.out, "report.md")}`);
}

main().catch((e) => {
  console.error("[eval] failed:", (e as Error).message);
  process.exit(1);
});
