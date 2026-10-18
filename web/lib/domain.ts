// Domain types and the words users see. Every label here comes from replica/design/glossary.md;
// screens import these instead of writing their own wording. Code values match schema.sql.

export const VERDICTS = ["authentic", "ai_generated", "edited", "miscontextualized", "inconclusive"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const EVIDENCE_KINDS = [
  "source_match",
  "c2pa",
  "watermark",
  "fact_check",
  "exif",
  "pixel_model",
  "screen_recapture",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type Strength = "strong" | "medium" | "weak";
export type Outcome = "supports_real" | "supports_manipulated" | "neutral" | "unavailable";

export const VERDICT_LABEL: Record<Verdict, string> = {
  authentic: "진짜 확인",
  ai_generated: "AI 생성",
  edited: "편집 조작",
  miscontextualized: "맥락 조작",
  inconclusive: "판단 불가",
};

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  source_match: "원본 일치",
  c2pa: "출처 증명 (C2PA)",
  watermark: "워터마크",
  fact_check: "팩트체크 기록",
  exif: "촬영 정보 (EXIF)",
  pixel_model: "AI 탐지",
  screen_recapture: "화면 재촬영",
};

export const STRENGTH_LABEL: Record<Strength, string> = { strong: "강", medium: "중", weak: "약" };
export const STRENGTH_RANK: Record<Strength, number> = { strong: 3, medium: 2, weak: 1 };

export const OUTCOME_LABEL: Record<Outcome, string> = {
  supports_real: "진짜 쪽 근거",
  supports_manipulated: "조작 쪽 근거",
  neutral: "영향 없음",
  unavailable: "확인 못 함",
};

// Order of evidence cards when strength ties (components.md §2).
export const KIND_ORDER: EvidenceKind[] = [...EVIDENCE_KINDS];

export const DATE_SOURCE_LABEL = {
  tineye_crawl: "TinEye가 처음 발견한 날짜 (실제 게시일은 더 이를 수 있음)",
  page_meta: "페이지에 적힌 게시일",
} as const;
export type DateSource = keyof typeof DATE_SOURCE_LABEL;

export const COPY = {
  disclaimer: "자동 분석에는 오류가 있을 수 있어요. 이 결과만으로 누군가를 비난하지 마세요.",
  urlScope: "페이지 속 이미지만 확인해요. 기사 내용이 사실인지는 확인하지 않아요.",
  noSourceTitle: "원본 없음",
  noSourceBody: "다른 곳에서 같은 사진을 찾지 못했어요. 원본이 없다고 가짜라는 뜻은 아니에요.",
  analyzing: "근거를 모으고 있어요",
  failed: "분석하지 못했어요",
  notCharged: "이번 검사는 무료 횟수에서 빼지 않았어요.",
  quotaTitle: "오늘 무료 검사를 다 썼어요",
} as const;

export type DiffRegion = { x: number; y: number; w: number; h: number; note: string };

export interface SourceMatch {
  url: string;
  imageUrl: string | null;
  pageTitle: string | null;
  firstSeenAt: string | null; // ISO date
  firstSeenSource: DateSource | null;
  similarity: number; // 0..1
  isEarliest: boolean;
  diffRegions: DiffRegion[];
  provider: string;
}

export interface Evidence {
  kind: EvidenceKind;
  outcome: Outcome;
  strength: Strength;
  score: number | null;
  summary: string;
  details: Record<string, unknown>;
  sourceUrl: string | null;
  provider: string;
}

export type StepId = "image" | "source" | "provenance" | "verdict";
export type StepState = "waiting" | "running" | "done" | "failed";
export const STEP_LABEL: Record<StepId, string> = {
  image: "이미지 확인",
  source: "원본 검색",
  provenance: "출처 증명·워터마크",
  verdict: "판정",
};
export const STEP_ORDER: StepId[] = ["image", "source", "provenance", "verdict"];

export type AnalysisStatus = "pending" | "running" | "done" | "failed";
export type ErrorCode =
  | "unsupported_type"
  | "too_large"
  | "url_no_image"
  | "url_blocked"
  | "provider_timeout"
  | "internal";

export const ERROR_COPY: Record<ErrorCode, string> = {
  unsupported_type: "JPG, PNG, WebP, HEIC 이미지만 검사할 수 있어요.",
  too_large: "10MB보다 큰 이미지는 검사할 수 없어요.",
  url_no_image: "이 페이지에서 이미지를 찾지 못했어요.",
  url_blocked: "이 페이지는 가져올 수 없어요. (로그인이 필요하거나 접근이 막힌 페이지)",
  provider_timeout: "원본 검색 서비스가 응답하지 않았어요.",
  internal: "알 수 없는 문제가 생겼어요.",
};

export interface Analysis {
  id: string;
  inputKey: string;
  pipelineVersion: number;
  status: AnalysisStatus;
  steps: Record<StepId, StepState>;
  verdict: Verdict | null;
  verdictReason: string | null;
  errorCode: ErrorCode | null;
  evidence: Evidence[];
  matches: SourceMatch[];
  searchedProviders: string[];
  startedAt: string;
  finishedAt: string | null;
}

export interface Check {
  id: string;
  userId: string;
  analysisId: string;
  inputType: "image" | "url";
  pageUrl: string | null;
  fileName: string | null;
  claimedDate: string | null; // YYYY-MM-DD the user says the event happened, optional
  charged: boolean;
  quotaDay: string; // UTC day the quota was taken from
  createdAt: string;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
