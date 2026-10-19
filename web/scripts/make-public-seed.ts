// Builds data/public-cases.json: fictional example cases for the public dashboard.
// Each case runs a synthetic fixture through the real pipeline (fictional .test pages, mock transport), the judge
// (rules v3) and the court with scripted agents. Titles and summaries are written here and describe fiction only.
// Unapproved cases are included on purpose: the store and RLS must keep them off every page.
//   npx tsx scripts/make-public-seed.ts
import { readFile, writeFile } from "node:fs/promises";
import { DOUBTS_FOR, runCourt, type CourtRecord } from "../lib/court/court";
import type { Card } from "../lib/court/docket";
import type { Verdict } from "../lib/domain";
import { MockLLMProvider } from "../lib/llm/mock";
import type { LLMRequest } from "../lib/llm/types";
import { createFreeProviders, createMockProviders, type Providers } from "../lib/providers";
import type { PublicCase, PublicCourtRecord } from "../lib/public/types";
import { decideVerdict } from "../lib/verdict";
import { collectEvidence } from "../lib/verification/engine";
import { mockTransport } from "../lib/verification/mock";
import { loadTrustedSources } from "../lib/verification/trusted-sources";

const REVIEWER_A = "00000000-0000-4000-8000-0000000000a1"; // fictional operator ids
const REVIEWER_B = "00000000-0000-4000-8000-0000000000b2";

const cardsOf = (req: LLMRequest) => {
  const doc = JSON.parse(req.prompt.replace(/^<case_file>\n/, "").replace(/\n<\/case_file>$/, ""));
  return { cards: doc.cards as Card[], verdict: doc.judge.verdict as Verdict };
};
const ids = (cs: Card[], pred: (c: Card) => boolean) => cs.filter(pred).map((c) => c.id).slice(0, 2);

/** Scripted agents. `doubtJuror` (1-3) adopts the defense's first alternative if the court accepted it. */
function agents(doubtJuror: number | null) {
  return new MockLLMProvider({
    prosecutor: (req) => {
      const { cards } = cardsOf(req);
      const cite = ids(cards, (c) => c.outcome === "supports_manipulated" || c.kind === "source_page");
      return { claims: cite.length ? [{ text: "인용한 근거 카드가 조작 또는 다른 맥락을 가리켜요.", cite }] : [] };
    },
    defense: (req) => {
      const { cards, verdict } = cardsOf(req);
      if (verdict === "inconclusive") return { alternatives: [] };
      const kind = DOUBTS_FOR[verdict as Exclude<Verdict, "inconclusive">][0];
      const cite = ids(cards, (c) => c.kind === "source_page" || c.kind === "image_comparison" || c.kind === "c2pa");
      const text = {
        same_place_different_time: "같은 장소를 다른 시점에 찍은 사진일 수 있어요.",
        date_error: "후보 페이지의 게시일이 실제 촬영일과 다를 수 있어요.",
        provenance_doubt: "출처 기록의 해석에 다른 가능성이 있을 수 있어요.",
        possible_manipulation: "다른 조작 가능성이 남아 있어요.",
      }[kind as string] ?? "다른 설명이 가능할 수 있어요.";
      return { alternatives: [{ kind, text, cite }] };
    },
    juror: (req, call) => {
      if (doubtJuror === null || call !== doubtJuror - 1) return { decision: "uphold", doubt: null };
      const { cards, verdict } = cardsOf(req);
      const kind = DOUBTS_FOR[verdict as Exclude<Verdict, "inconclusive">][0];
      return { decision: "inconclusive", doubt: { kind, text: "차이 영역이 두 곳이라, 편집인지 다른 시점의 사진인지 이 카드만으로는 구분되지 않아요.", cite: ids(cards, (c) => c.kind === "source_page"), adopts: "D1" } };
    },
    clerk: (req) => {
      const { cards } = cardsOf(req);
      const cite = ids(cards, (c) => c.kind === "source_page" || c.outcome === "supports_manipulated");
      return cite.length ? { summary: { text: "판결은 인용된 근거 카드에 있는 관찰만을 바탕으로 해요.", cite } } : {};
    },
  });
}

interface Spec {
  slug: string;
  file: string;
  providers: "free" | "mock";
  candidates?: string[];
  claimedDate?: string;
  doubtJuror?: number;
  topic: PublicCase["topic"];
  channels: PublicCase["channels"];
  truthTitle: (v: Verdict) => string;
  summary: string;
  imageAlt: string;
  status?: PublicCase["approvalStatus"];
  flags?: PublicCase["contentFlags"];
  second?: boolean;
  publishedAt: string;
}

const SPECS: Spec[] = [
  {
    slug: "alley-house-sold-sign", file: "trusted_edited", providers: "free", candidates: ["https://wire.example.test/2021/04/old-house"],
    topic: "economy", channels: ["community", "messenger"], publishedAt: "2026-10-18T09:00:00Z",
    truthTitle: () => "골목 주택 사진의 '급매' 표지는 나중에 합성됐어요. 2021년 원본에는 없어요",
    summary: "부동산 급매가 쏟아진다는 글에 쓰인 사진이에요. 가상의 신뢰 출처에 2021년 4월 실린 같은 사진에는 표지가 없어요. (가상의 예시)",
    imageAlt: "골목 주택 그림. 오른쪽 아래에 초록색 표지가 있어요",
  },
  {
    slug: "park-festival-not-flood", file: "trusted_context", providers: "free", candidates: ["https://wire.example.test/2018/07/park-festival"], claimedDate: "2026-10-01",
    topic: "society", channels: ["instagram", "messenger"], publishedAt: "2026-10-17T09:00:00Z",
    truthTitle: () => "'어제 공원 침수 현장'이라던 사진은 2018년 여름 공원 축제 사진이에요",
    summary: "최근 사건 사진이라며 퍼진 이미지예요. 같은 사진이 가상의 신뢰 출처에 2018년 7월 게시되어 있어요. (가상의 예시)",
    imageAlt: "공원 건물과 간판이 있는 그림",
  },
  {
    slug: "desert-lantern-concert-ai", file: "ai_generated", providers: "mock",
    topic: "entertainment", channels: ["youtube", "instagram"], publishedAt: "2026-10-16T09:00:00Z",
    truthTitle: () => "'사막 위 등불 공연' 홍보 사진은 AI로 만든 이미지예요",
    summary: "공연 홍보물로 공유된 이미지예요. 파일에 남은 출처 기록(모의 C2PA)이 AI 생성 도구를 가리켜요. (가상의 예시)",
    imageAlt: "분홍 사구 위로 고리 행성과 등불이 떠 있는 그림",
  },
  {
    slug: "sale-cafe-sign-edited", file: "edited", providers: "mock", doubtJuror: 2,
    topic: "economy", channels: ["community"], publishedAt: "2026-10-15T09:00:00Z",
    truthTitle: (v) => v === "inconclusive"
      ? "'세일' 카페 사진이 원본을 고친 것인지, 같은 거리의 다른 사진인지는 아직 확인되지 않았어요"
      : "'세일' 카페 사진은 2023년 원본을 AI 도구로 고친 이미지예요",
    summary: "가게 폐업 세일 소문과 함께 퍼진 사진이에요. 파일의 출처 기록(모의 C2PA)에 AI 편집이 남아 있고, 2023년 원본 후보와 비교하면 한 곳이 달라요. 배심원 한 명이 '다른 시점의 사진' 가능성을 냈지만, 근거 카드에 그 신호가 없어 받아들여지지 않았어요. (가상의 예시)",
    imageAlt: "카페 거리 그림. 간판과 사람이 보여요",
  },
  {
    slug: "rally-crowd-no-evidence", file: "no_source", providers: "free", candidates: [],
    topic: "politics", channels: ["community", "news"], second: true, publishedAt: "2026-10-14T09:00:00Z",
    truthTitle: () => "'유세 현장 인파' 사진이라는 주장은 확인할 근거가 아직 없어요",
    summary: "특정 행사의 인파 사진이라는 글과 함께 퍼졌어요. 다른 곳에서 같은 사진을 찾지 못했고, 출처 기록도 없어요. 진짜라는 뜻도, 가짜라는 뜻도 아니에요. (가상의 예시)",
    imageAlt: "주택가 그림",
  },
  // Never shown: pending review, rejected, and a case flagged as sexual content (blocked even if someone approves it).
  {
    slug: "pending-market-photo", file: "miscontextualized", providers: "mock", claimedDate: "2026-10-01", status: "pending_review",
    topic: "society", channels: ["messenger"], publishedAt: "2026-10-19T09:00:00Z",
    truthTitle: () => "검토 중인 사례예요", summary: "운영자 검토 전이라 공개되지 않아요. (가상의 예시)", imageAlt: "시장 그림",
  },
  {
    slug: "rejected-example", file: "authentic", providers: "mock", status: "rejected",
    topic: "other", channels: ["news"], publishedAt: "2026-10-19T09:00:00Z",
    truthTitle: () => "반려된 사례예요", summary: "반려되어 공개되지 않아요. (가상의 예시)", imageAlt: "카페 거리 그림",
  },
  {
    slug: "blocked-sexual-flag", file: "edited", providers: "mock", status: "approved", flags: ["sexual_content"],
    topic: "entertainment", channels: ["messenger"], publishedAt: "2026-10-19T09:00:00Z",
    truthTitle: () => "표시 금지 표시가 붙은 사례예요", summary: "성적 콘텐츠 표시가 있어 승인 상태여도 어디에도 나오지 않아요. (가상의 예시, 실제 이미지 없음)", imageAlt: "",
  },
];

async function build(spec: Spec): Promise<PublicCase> {
  const signal = AbortSignal.timeout(120_000);
  let p: Providers = spec.providers === "mock" ? createMockProviders() : createFreeProviders(mockTransport, "/nonexistent/index.jsonl");
  if (spec.candidates) {
    const urls = spec.candidates;
    p = { ...p, reverseSearch: { name: "fixed", search: async () => ({ candidates: urls.map((url) => ({ url, provider: "fixed" })), searchedProviders: ["고정 후보"] }) } };
  }
  const input = await p.input.normalize({ bytes: new Uint8Array(await readFile(`public/fixtures/inputs/${spec.file}.png`)), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal);
  const c = await collectEvidence(input, p, signal);
  const verdict = decideVerdict({ evidence: c.evidence, matches: c.matches, claimedDate: spec.claimedDate ?? null, trustedSources: loadTrustedSources({ includeMock: true }) });
  const r: CourtRecord = await runCourt({ verdict, evidence: c.evidence, matches: c.matches }, agents(spec.doubtJuror ?? null), signal);
  const court: PublicCourtRecord = {
    opened: r.opened, judgeVerdict: r.judgeVerdict, judgeReason: verdict.reason, finalVerdict: r.finalVerdict, downgraded: r.downgraded,
    prosecution: r.prosecution, defense: r.defense, jurors: r.jurors, rejectedCount: r.rejected.length,
    rejected: r.rejected.map(({ role, reason }) => ({ role, reason })), judgment: r.judgment,
  };
  const approved = (spec.status ?? "approved") === "approved";
  console.log(`${spec.slug}: judge=${r.judgeVerdict} final=${r.finalVerdict} rule=${verdict.rule} status=${spec.status ?? "approved"}`);
  return {
    id: spec.slug, slug: spec.slug, topic: spec.topic, verdict: r.finalVerdict, channels: spec.channels,
    truthTitle: spec.truthTitle(r.finalVerdict), summary: spec.summary,
    imagePath: spec.flags?.includes("sexual_content") ? null : `/fixtures/inputs/${spec.file}.png`, imageAlt: spec.imageAlt,
    court, cards: r.docket.cards.map((card) => { const { untrustedPageText, ...rest } = card; void untrustedPageText; return rest; }), // page text is never published
    contentFlags: spec.flags ?? [], legalWarnings: [], approvalStatus: spec.status ?? "approved",
    reviewedBy: approved || spec.status === "rejected" ? REVIEWER_A : null, reviewedAt: approved || spec.status === "rejected" ? spec.publishedAt : null,
    secondReviewedBy: spec.second ? REVIEWER_B : null, secondReviewedAt: spec.second ? spec.publishedAt : null,
    publishedAt: approved ? spec.publishedAt : null, example: true,
  };
}

async function main() {
  const out: PublicCase[] = [];
  for (const s of SPECS) out.push(await build(s));
  await writeFile("data/public-cases.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${out.length} cases to data/public-cases.json`);
}
main();
