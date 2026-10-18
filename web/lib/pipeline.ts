// The analysis pipeline: image → reverse search → provenance signals → verdict.
// Steps are recorded so the 분석 중 screen shows real progress, never a fake bar.
// The verdict is computed per check at read time (verdictForCheck), because it depends on the
// claimed date the user typed, while the evidence itself is shared by everyone who sent the same image.
import { createHash } from "node:crypto";
import { getStore, type User } from "./data/store";
import {
  ACCEPTED_MIME,
  type Analysis,
  type Check,
  type ErrorCode,
  MAX_IMAGE_BYTES,
  type StepId,
} from "./domain";
import { getProviders } from "./providers";
import { type ImageInput, ProviderError } from "./providers/types";
import { decideVerdict, PIPELINE_VERSION, sortEvidence, type VerdictResult } from "./verdict";

const PROVIDER_TIMEOUT_MS = 20_000;

export type StartResult =
  | { ok: true; check: Check }
  | { ok: false; reason: "quota"; used: number; limit: number }
  | { ok: false; reason: "invalid"; errorCode: ErrorCode };

export interface StartInput {
  bytes: Uint8Array;
  mime: string;
  fileName: string | null;
  inputType: "image" | "url";
  pageUrl: string | null;
  publicImageUrl: string | null;
  claimedDate: string | null;
  forceFresh?: boolean; // 재검사: ignore a cached analysis
}

export function validateImage(bytes: Uint8Array, mime: string): ErrorCode | null {
  if (!ACCEPTED_MIME.includes(mime)) return "unsupported_type";
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return "too_large";
  return null;
}

export async function startCheck(user: User, input: StartInput): Promise<StartResult> {
  const invalid = validateImage(input.bytes, input.mime);
  if (invalid) return { ok: false, reason: "invalid", errorCode: invalid };

  const store = getStore();
  const quota = await store.takeQuota(user.id);
  if (!quota.ok) return { ok: false, reason: "quota", used: quota.used, limit: quota.limit };

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const reusable = input.forceFresh ? null : await store.findReusableAnalysis(sha256, PIPELINE_VERSION);
  const analysis = reusable ?? (await store.createAnalysis(sha256, PIPELINE_VERSION));

  const check = await store.createCheck({
    userId: user.id,
    analysisId: analysis.id,
    inputType: input.inputType,
    pageUrl: input.pageUrl,
    fileName: input.fileName,
    claimedDate: input.claimedDate,
    charged: true,
    quotaDay: quota.day,
  });
  await store.saveUpload(check.id, input.bytes, input.mime);

  if (!reusable) {
    const image: ImageInput = { bytes: input.bytes, mime: input.mime, sha256, publicUrl: input.publicImageUrl };
    // Fire and forget: the client polls GET /api/checks/:id. A real deployment runs this as an Inngest job.
    void runAnalysis(analysis.id, image);
  }
  return { ok: true, check };
}

async function runAnalysis(analysisId: string, image: ImageInput) {
  const store = getStore();
  const { reverseSearch, signals } = getProviders();
  const step = (id: StepId, state: "running" | "done" | "failed") => store.updateAnalysis(analysisId, { steps: { [id]: state } as Analysis["steps"] });

  try {
    await store.updateAnalysis(analysisId, { status: "running" });
    await step("image", "running");
    await step("image", "done");

    await step("source", "running");
    const found = await reverseSearch.search(image, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
    await store.updateAnalysis(analysisId, { matches: found.matches, searchedProviders: found.searchedProviders });
    await step("source", "done");

    await step("provenance", "running");
    const evidence = await signals.collect(image, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
    await store.updateAnalysis(analysisId, { evidence: sortEvidence(evidence) });
    await step("provenance", "done");

    await step("verdict", "running");
    // Stored verdict assumes no claimed date; each check recomputes with its own (verdictForCheck).
    const base = decideVerdict({ evidence, matches: found.matches, claimedDate: null });
    await store.updateAnalysis(analysisId, {
      steps: { verdict: "done" } as Analysis["steps"],
      status: "done",
      verdict: base.verdict,
      verdictReason: base.reason,
      finishedAt: new Date().toISOString(),
    });
  } catch (e) {
    const code: ErrorCode =
      e instanceof ProviderError ? (e.code === "provider_timeout" ? "provider_timeout" : "internal")
      : (e as Error)?.name === "TimeoutError" ? "provider_timeout"
      : "internal";
    const current = await store.getAnalysis(analysisId);
    const running = current && (Object.entries(current.steps).find(([, s]) => s === "running")?.[0] as StepId | undefined);
    await store.updateAnalysis(analysisId, {
      status: "failed",
      errorCode: code,
      finishedAt: new Date().toISOString(),
      ...(running ? { steps: { [running]: "failed" } as Analysis["steps"] } : {}),
    });
    await refundFailedChecks(analysisId);
    if (code === "internal") console.error("analysis failed", analysisId, e);
  }
}

// 분석 실패 → 무료 횟수를 돌려준다 (components.md 4-2, 리뷰 불만 #9).
async function refundFailedChecks(analysisId: string) {
  const store = getStore();
  for (const c of await store.listChecksForAnalysis(analysisId)) {
    if (!c.charged) continue;
    await store.refundQuota(c.userId, c.quotaDay);
    await store.updateCheck(c.id, { charged: false });
  }
}

export function verdictForCheck(analysis: Analysis, check: Check): VerdictResult | null {
  if (analysis.status !== "done") return null;
  return decideVerdict({ evidence: analysis.evidence, matches: analysis.matches, claimedDate: check.claimedDate });
}
