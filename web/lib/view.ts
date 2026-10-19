// What the result screen receives. One place, so the API and the history list agree.
import type { Analysis, Check, ErrorCode, Evidence, SourceMatch, StepId, StepState, Strength, Verdict } from "./domain";
import { verdictForCheck } from "./pipeline";
import { isMock } from "./providers";
import type { VerificationFacts } from "./verification/types";
import { type HeadlineFinding, sortEvidence } from "./verdict";

export interface CheckView {
  id: string;
  inputType: Check["inputType"];
  pageUrl: string | null;
  fileName: string | null;
  claimedDate: string | null;
  createdAt: string;
  charged: boolean;
  imageUrl: string;
  status: Analysis["status"];
  steps: Record<StepId, StepState>;
  verdict: Verdict | null;
  reason: string | null;
  missing: string[];
  evidence: Evidence[];
  matches: SourceMatch[];
  searchedProviders: string[];
  errorCode: ErrorCode | null;
  checkedAt: string | null;
  pipelineVersion: number;
  analysisId: string;
  mock: boolean;
  claimText: string;
  verification?: VerificationFacts;
  headlineFinding: HeadlineFinding | null; // strongest single observation, shown even for 판단 불가
  verdictRule: string | null; // e.g. "v3.trusted_edited"; shown under 상세 점수
  verdictStrength: Strength | null;
}

export function toCheckView(check: Check, analysis: Analysis): CheckView {
  const v = verdictForCheck(analysis, check);
  return {
    id: check.id,
    inputType: check.inputType,
    pageUrl: check.pageUrl,
    fileName: check.fileName,
    claimedDate: check.claimedDate,
    createdAt: check.createdAt,
    charged: check.charged,
    imageUrl: `/api/checks/${check.id}/image`,
    status: analysis.status === "done" && check.contextStatus === "pending" ? "running" : analysis.status,
    steps: { ...analysis.steps, context: analysis.status === "done" ? (check.contextStatus === "pending" ? "running" : "done") : "waiting", verdict: v ? "done" : "waiting" },
    verdict: v?.verdict ?? null,
    reason: v?.reason ?? null,
    missing: v?.missing ?? [],
    evidence: sortEvidence([...analysis.evidence, ...(check.contextEvidence ?? [])]),
    matches: analysis.matches,
    searchedProviders: analysis.searchedProviders,
    errorCode: analysis.errorCode,
    checkedAt: analysis.finishedAt,
    pipelineVersion: analysis.pipelineVersion,
    analysisId: analysis.id,
    mock: isMock,
    claimText: check.claimText ?? "",
    verification: analysis.verification,
    headlineFinding: v?.headlineFinding ?? null,
    verdictRule: v?.rule ?? null,
    verdictStrength: v?.strength ?? null,
  };
}
