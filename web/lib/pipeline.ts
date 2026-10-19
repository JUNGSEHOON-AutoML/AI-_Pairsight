// The analysis pipeline: image → reverse search → provenance signals → verdict.
// Steps are recorded so the 분석 중 screen shows real progress, never a fake bar.
// The verdict is computed per check at read time (verdictForCheck), because it depends on the
// claimed date the user typed, while the evidence itself is shared by everyone who sent the same image.
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
import { ProviderError } from "./providers/types";
import { PIPELINE_VERSION, sortEvidence, type VerdictResult } from "./verdict";
import { THRESHOLD_FINGERPRINT } from "./verification/thresholds";

import { collectEvidence, compareContext } from "./verification/engine";
import type { NormalizedInput } from "./verification/types";
import { excerpt, publicUrl } from "./verification/retention";
const PROVIDER_TIMEOUT_MS = 30_000;

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
  claimText?: string;
  thumbnailOnly?: boolean;
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

  let normalized: NormalizedInput;
  try { normalized = await getProviders().input.normalize(input, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)); }
  catch (e) { return { ok: false, reason: "invalid", errorCode: e instanceof ProviderError ? e.code : "unsupported_type" }; }
  const store = getStore();
  const quota = await store.takeQuota(user.id);
  if (!quota.ok) return { ok: false, reason: "quota", used: quota.used, limit: quota.limit };

  const sha256 = normalized.image.sha256;
  const inputKey = `${sha256}:${THRESHOLD_FINGERPRINT}`;
  const reusable = input.forceFresh ? null : await store.findReusableAnalysis(inputKey, PIPELINE_VERSION);
  const analysis = reusable ?? (await store.createAnalysis(inputKey, PIPELINE_VERSION));

  const check = await store.createCheck({
    userId: user.id,
    analysisId: analysis.id,
    inputType: input.inputType,
    pageUrl: input.pageUrl ? publicUrl(input.pageUrl) : null,
    fileName: input.fileName,
    claimedDate: input.claimedDate,
    claimText: excerpt(input.claimText ?? ""),
    contextStatus: "pending",
    contextEvidence: [],
    charged: true,
    quotaDay: quota.day,
  });
  await store.saveUpload(check.id, normalized.thumbnail.bytes, normalized.thumbnail.mime);

  if (!reusable) void runAnalysis(analysis.id, normalized);
  else if (reusable.status === "done") void finishContext(check.id);
  else {
    const latest = await store.getAnalysis(analysis.id);
    if (latest?.status === "done") void finishContext(check.id);
    if (latest?.status === "failed") await refundFailedChecks(analysis.id);
  }
  return { ok: true, check };
}

async function runAnalysis(analysisId: string, input: NormalizedInput) {
  const store = getStore();
  const providers = getProviders();
  const step = async (id: StepId, state: "running" | "done") => { await store.updateAnalysis(analysisId, { steps: { [id]: state } as Analysis["steps"] }); };
  try {
    await store.updateAnalysis(analysisId, { status: "running" });
    await step("image", "done");
    const collected = await collectEvidence(input, providers, AbortSignal.timeout(PROVIDER_TIMEOUT_MS), step);
    await store.updateAnalysis(analysisId, { ...collected, evidence: sortEvidence(collected.evidence),
      status: "done", finishedAt: new Date().toISOString() });
    for (const check of await store.listChecksForAnalysis(analysisId)) await finishContext(check.id);
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
    if (code === "internal") console.error("analysis failed", analysisId, code);
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

async function finishContext(checkId: string) {
  const store = getStore(), check = await store.getCheck(checkId);
  if (!check) return;
  const analysis = await store.getAnalysis(check.analysisId);
  if (!analysis || analysis.status !== "done") return;
  const contextEvidence = await compareContext({ text: check.claimText ?? "", date: check.claimedDate }, {
    evidence: analysis.evidence, matches: analysis.matches, searchedProviders: analysis.searchedProviders,
    verification: analysis.verification ?? { factChecks: [], sources: [], warnings: [] },
  }, getProviders(), AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
  if (await store.getCheck(checkId)) await store.updateCheck(checkId, { contextEvidence, contextStatus: "done" });
}

export function verdictForCheck(analysis: Analysis, check: Check): VerdictResult | null {
  if (analysis.status !== "done" || check.contextStatus === "pending") return null;
  return getProviders().verdict.decide({ evidence: [...analysis.evidence, ...(check.contextEvidence ?? [])], matches: analysis.matches, claimedDate: check.claimedDate, claimText: check.claimText });
}
