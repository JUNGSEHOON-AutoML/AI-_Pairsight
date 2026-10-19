// Fixed mock data. Each scenario reproduces one screen: the five verdicts, 원본 없음, and a provider failure.
// Images live in public/fixtures (drawn by scripts/make-fixtures.py). Organisation and site names
// below are fictional and say so; nothing here imitates a real fact-checker or publisher.
import type { Evidence, SourceMatch } from "../../domain";

export const SCENARIOS = [
  "authentic",
  "ai_generated",
  "edited",
  "miscontextualized",
  "inconclusive",
  "no_source",
  "fact_check_found",
  "trusted_edited",
  "trusted_context",
  "provider_timeout",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_NOTE: Record<Scenario, string> = {
  authentic: "진짜 확인: 유효한 카메라 출처 기록 (모의 C2PA)",
  ai_generated: "AI 생성: C2PA에 AI 생성 기록 (원본 없음과 함께)",
  edited: "편집 조작: 모의 C2PA 편집 기록 + 실제 픽셀 차이",
  miscontextualized: "맥락 조작: 2019년 사진 + 팩트체크 기록",
  inconclusive: "판단 불가: 비슷한 사진만 있고 날짜 없음",
  no_source: "판단 불가 + 원본 없음: 아무 기록도 없음",
  fact_check_found: "기존 팩트체크 발견: 현재 주장과 같은지 확인 전에는 판단 보류",
  trusted_edited: "v3 편집 조작: 메타데이터 없음 + 가상 신뢰 출처의 이른 사진과 국소 차이",
  trusted_context: "v3 맥락 조작: 메타데이터 없음 + 가상 신뢰 출처에 2018년 게시, 알려준 날짜 2026-10-01",
  provider_timeout: "분석 실패: 원본 검색 서비스 시간 초과",
};

const P = "mock";
const original = (s: Scenario) => `/fixtures/originals/${s}.png`;

const neutral = (kind: Evidence["kind"], summary: string, strength: Evidence["strength"] = "medium"): Evidence => ({
  kind,
  outcome: "neutral",
  strength,
  score: null,
  summary,
  details: {},
  sourceUrl: null,
  provider: P,
});

const pixel = (score: number, outcome: Evidence["outcome"] = "neutral"): Evidence => ({
  kind: "pixel_model",
  outcome,
  strength: "weak", // always weak (glossary.md, schema constraint pixel_model_is_weak)
  score,
  summary:
    score >= 70
      ? "AI 탐지 모델 점수가 높아요. 참고용이고, 이것만으로 판정하지 않아요."
      : "AI 탐지 모델 점수가 중간 이하예요. 이것만으로 판정하지 않아요.",
  details: {},
  sourceUrl: null,
  provider: P,
});

export interface ScenarioData {
  matches: SourceMatch[];
  evidence: Evidence[];
  fail?: "provider_timeout";
}

export const SCENARIO_DATA: Record<Scenario, ScenarioData> = {
  authentic: {
    matches: [
      {
        url: "https://news.example.test/2024/05/street-cafe",
        imageUrl: original("authentic"),
        pageTitle: "예시 뉴스 · 골목 카페 거리 (가상의 기사)",
        firstSeenAt: "2024-05-10",
        firstSeenSource: "page_meta",
        similarity: 0.995,
        isEarliest: true,
        diffRegions: [],
        provider: P,
      },
    ],
    evidence: [
      {
        kind: "source_match",
        outcome: "supports_real",
        strength: "strong",
        score: null,
        summary: "같은 사진이 2024-05-10 기사에 먼저 실렸고, 달라진 곳은 없어요.",
        details: {},
        sourceUrl: "https://news.example.test/2024/05/street-cafe",
        provider: P,
      },
      { ...neutral("c2pa", "모의 C2PA 검증: 카메라 촬영과 무편집 이력이 유효해요.", "strong"), outcome: "supports_real", details: { signatureValid: true, action: "camera_capture", noEdits: true } },
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(12),
    ],
  },
  ai_generated: {
    matches: [],
    evidence: [
      {
        kind: "c2pa",
        outcome: "supports_manipulated",
        strength: "strong",
        score: null,
        summary: "서명된 출처 기록에 'AI 이미지 생성 도구'로 만들었다고 적혀 있어요.",
        details: { signatureValid: true, action: "ai_generated", tool: "예시 이미지 생성기 (가상)" },
        sourceUrl: null,
        provider: P,
      },
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(91),
    ],
  },
  edited: {
    matches: [
      {
        url: "https://photos.example.test/2023/08/cafe-street",
        imageUrl: original("edited"),
        pageTitle: "예시 사진 블로그 · 카페 거리 (가상의 페이지)",
        firstSeenAt: "2023-08-14",
        firstSeenSource: "tineye_crawl",
        similarity: 0.86,
        isEarliest: true,
        diffRegions: [
          { x: 0.615, y: 0.14, w: 0.27, h: 0.21, note: "오른쪽 위 간판의 글자가 바뀌었어요" },
          { x: 0.17, y: 0.6, w: 0.11, h: 0.28, note: "왼쪽 아래에 사람이 추가됐어요" },
        ],
        provider: P,
      },
    ],
    evidence: [
      {
        kind: "source_match",
        outcome: "supports_manipulated",
        strength: "strong",
        score: null,
        summary: "더 이른 원본을 찾았어요. 원본과 달라진 곳이 2군데 있어요.",
        details: {},
        sourceUrl: "https://photos.example.test/2023/08/cafe-street",
        provider: P,
      },
      { ...neutral("c2pa", "모의 C2PA 검증: AI 편집 이력이 유효해요.", "strong"), outcome: "supports_manipulated", details: { signatureValid: true, action: "ai_edited" } },
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(34),
    ],
  },
  miscontextualized: {
    matches: [
      {
        url: "https://archive.example.test/2019/03/winter-market",
        imageUrl: original("miscontextualized"),
        pageTitle: "예시 아카이브 · 겨울 시장 (가상의 페이지)",
        firstSeenAt: "2019-03-02",
        firstSeenSource: "tineye_crawl",
        similarity: 0.997,
        isEarliest: true,
        diffRegions: [],
        provider: P,
      },
    ],
    evidence: [
      {
        kind: "fact_check",
        outcome: "supports_manipulated",
        strength: "strong",
        score: null,
        summary: "팩트체크 기관이 이 사진을 '다른 해, 다른 장소의 사진'으로 판정했어요.",
        details: { publisher: "예시 팩트체크 센터 (가상)", rating: "사실과 다름", claimMatched: true, imageMatched: true, pageVerified: true },
        sourceUrl: "https://factcheck.example.test/claims/winter-market",
        provider: P,
      },
      {
        kind: "source_match",
        outcome: "neutral",
        strength: "medium",
        score: null,
        summary: "같은 사진이 2019-03-02 이전에 이미 있었어요. 사진 자체는 바뀌지 않았어요.",
        details: {},
        sourceUrl: "https://archive.example.test/2019/03/winter-market",
        provider: P,
      },
      neutral("c2pa", "파일에 출처 기록(C2PA)이 없어요."),
      pixel(9),
    ],
  },
  inconclusive: {
    matches: [
      {
        url: "https://blog.example.test/park-walk",
        imageUrl: original("inconclusive"),
        pageTitle: "예시 블로그 · 공원 산책 (가상의 페이지)",
        firstSeenAt: null,
        firstSeenSource: null,
        similarity: 0.74,
        isEarliest: true,
        diffRegions: [],
        provider: P,
      },
    ],
    evidence: [
      {
        kind: "source_match",
        outcome: "neutral",
        strength: "weak",
        score: null,
        summary: "비슷한 사진은 있지만 같은 사진이라고 보기 어려워요. 날짜도 알 수 없어요.",
        details: {},
        sourceUrl: "https://blog.example.test/park-walk",
        provider: P,
      },
      neutral("c2pa", "파일에 출처 기록(C2PA)이 없어요."),
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(52),
    ],
  },
  no_source: {
    matches: [],
    evidence: [
      neutral("c2pa", "파일에 출처 기록(C2PA)이 없어요."),
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(41),
    ],
  },
  // v3: what a typical re-shared image looks like. No C2PA, no watermark, no fact-check; only a page on a
  // (fictional) trusted domain and a real pixel comparison. v2 says 판단 불가 for both.
  trusted_edited: {
    matches: [
      {
        url: "https://wire.example.test/2021/04/old-house",
        imageUrl: original("trusted_edited"),
        pageTitle: "예시 통신사 · 골목 주택 (가상의 기사)",
        firstSeenAt: "2021-04-12",
        firstSeenSource: "page_meta",
        similarity: 0.9,
        isEarliest: true,
        diffRegions: [],
        provider: P,
      },
    ],
    evidence: [
      neutral("c2pa", "파일에 출처 기록(C2PA)이 없어요. SNS에서 지워졌을 수 있어요."),
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(48),
    ],
  },
  trusted_context: {
    matches: [
      {
        url: "https://wire.example.test/2018/07/park-festival",
        imageUrl: original("trusted_context"),
        pageTitle: "예시 통신사 · 공원 축제 (가상의 기사)",
        firstSeenAt: "2018-07-21",
        firstSeenSource: "page_meta",
        similarity: 0.98,
        isEarliest: true,
        diffRegions: [],
        provider: P,
      },
    ],
    evidence: [
      neutral("c2pa", "파일에 출처 기록(C2PA)이 없어요. SNS에서 지워졌을 수 있어요."),
      neutral("watermark", "알려진 AI 워터마크를 찾지 못했어요."),
      pixel(20),
    ],
  },
  provider_timeout: { matches: [], evidence: [], fail: "provider_timeout" },
  fact_check_found: { matches: [], evidence: [neutral("c2pa", "파일에 출처 기록(C2PA)이 없어요.")] },
};

export const MOCK_CLAIM = "이 사진은 2026년 서울 홍수 현장이다.";

/** What the dev sample buttons send with each fixture (a claim and/or the date the user says it was taken). */
export const MOCK_FIXTURE_INPUT: Partial<Record<Scenario, { claimText?: string; claimedDate?: string }>> = {
  miscontextualized: { claimText: MOCK_CLAIM },
  trusted_context: { claimedDate: "2026-10-01" },
};
