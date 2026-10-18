// What the result screen receives. One place, so the API and the history list agree.
import type { Analysis, Check, ErrorCode, Evidence, SourceMatch, StepId, StepState, Verdict } from "./domain";
import { verdictForCheck } from "./pipeline";
import { isMock } from "./providers";
import { sortEvidence } from "./verdict";

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
    status: analysis.status,
    steps: analysis.steps,
    verdict: v?.verdict ?? null,
    reason: v?.reason ?? null,
    missing: v?.missing ?? [],
    evidence: sortEvidence(analysis.evidence),
    matches: analysis.matches,
    searchedProviders: analysis.searchedProviders,
    errorCode: analysis.errorCode,
    checkedAt: analysis.finishedAt,
    pipelineVersion: analysis.pipelineVersion,
    analysisId: analysis.id,
    mock: isMock,
  };
}
