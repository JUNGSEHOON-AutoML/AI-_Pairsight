import { collectEvidence, type Collected } from "../verification/engine";
import { OnDemandCandidateVerifier, NormalizingInputProvider, LocalMetadataProvider } from "../verification/adapters";
import { OnDemandPageProvider, PolicyFetch, guardedTransport, instructionSignals } from "../verification/page-fetch";
import { LocalImageComparisonProvider } from "../verification/image-comparison";
import { excerpt, hash, thumbnail } from "../verification/retention";
import { decideVerdict } from "../verdict";
import { loadTrustedSources } from "../verification/trusted-sources";
import { runCourt, type CourtRecord } from "../court/court";
import { createLLMProvider } from "../llm";
import type { LLMProvider } from "../llm/types";
import type { Providers } from "../providers";
import type { PageFetchProvider, VerifiedCandidate, Article, ImageComparisonProvider } from "../verification/types";
import type { CaseRepository } from "./repository";
import type { Workers } from "./flow";
import { CaseError, sectionData, type CaseRecord } from "./model";
import { type Topic, type PublicCase, publishProblems } from "../public/types";

type SavedImage = { url: string; thumbnail: string; hash: string };
export interface OsintData {
  inputImage: SavedImage | null;
  selection: "operator" | "representative_unconfirmed" | "none";
  inputExcerpt: string;
  candidates: { url: string; excerpt: string; dates: Article["dates"]; images: SavedImage[]; review?: Article["review"] }[];
  signals: string[];
  scope: string;
}
export interface AnalysisData { collected: Collected; imageMissing: boolean; thumbnailOnly: boolean; warnings: string[] }
export interface FactcheckData { court: CourtRecord; rule: string; calls: number }
const bytes = (data: string) => Buffer.from(data.split(",")[1], "base64");
const imageData = async (url: string, b: Uint8Array): Promise<SavedImage> => ({ url, hash: hash(b), thumbnail: "data:image/png;base64," + Buffer.from(await thumbnail(b)).toString("base64") });
export function classify(text: string): Topic {
  if (/선거|정당|대통령|국회|정치|투표/.test(text)) return "politics";
  if (/연예|배우|가수|아이돌|엔터|영화/.test(text)) return "entertainment";
  if (/재난|산불|지진|홍수|사회|사고|태풍/.test(text)) return "society";
  if (/경제|금리|주식|투자|부동산|은행/.test(text)) return "economy";
  return "other";
}
export function duplicateKey(c: Readonly<CaseRecord>) {
  const normalized = c.input.claim.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return hash(Buffer.from([normalized, c.input.imageHash ?? c.input.pageUrl ?? ""].join("\n")));
}
export function legalWarnings(c: Readonly<CaseRecord>, osint: OsintData): string[] {
  const topic = sectionData<{ topic: Topic }>(c, "monitoring").topic;
  const warnings = ["자동 경고이며 법률 판단이 아닙니다. 게재·삭제는 사람이 결정합니다."];
  if (!c.input.rightsConfirmed) warnings.push("이미지 이용 권한 미확인: 공개 이미지 사용 금지");
  if (topic === "politics") warnings.push("정치·선거: 서로 다른 운영자 2인 검토·선거 기간·후보자 관련 규정 확인");
  if (topic === "entertainment") warnings.push("연예·엔터: 성적 합성물·사생활 루머 제외, 공개된 조작물만 검토");
  if (c.input.contentFlags.length) warnings.push("콘텐츠 위험 플래그: " + c.input.contentFlags.join(", "));
  if (osint.selection !== "operator") warnings.push("기사 대표 이미지와 유포 주장의 이미지 동일성 미확인");
  if (osint.signals.length) warnings.push("페이지에 지시문으로 보이는 내용: 사람이 근거 원문을 확인해야 함");
  warnings.push("출처 링크·날짜·썸네일·200자 발췌만 보관. 작성자나 조작자의 신원·의도 단정 금지");
  return warnings;
}

/** Code workers call existing providers. No live worker uses fixture discovery, mock LLM or an image index. */
export function createNewsroomWorkers(repo: CaseRepository, options: {
  pages?: PageFetchProvider; images?: ImageComparisonProvider; llm?: LLMProvider; allowTestProviders?: boolean;
} = {}): Workers {
  const pages = options.pages ?? new OnDemandPageProvider(new PolicyFetch(guardedTransport, 1000));
  const images = options.images ?? new LocalImageComparisonProvider();
  const verifier = new OnDemandCandidateVerifier(pages, { name: "archive-not-connected", firstCapture: async () => null });
  const make = <D extends keyof Workers>(department: D, run: Workers[D]["run"]) => ({ department, run });
  return {
    monitoring: make("monitoring", async c => {
      const key = duplicateKey(c), others = repo.list(Boolean(options.allowTestProviders)).filter(x => x.id !== c.id && duplicateKey(x) === key);
      return { data: { topic: c.input.topic ?? classify(c.input.claim), method: c.input.topic ? "operator" : "keyword_rules",
        duplicateGroup: key, duplicateCaseIds: others.map(x => x.id), reportCount: others.length + 1 } };
    }),
    osint: make("osint", async (c, signal) => {
      const out: OsintData = { inputImage: null, selection: "none", inputExcerpt: "", candidates: [], signals: [], scope: "운영자가 지정한 후보/팩트체크 링크만 검증. 웹 전체 검색·자체 색인 없음" };
      if (c.input.thumbnail) { out.inputImage = { url: "", thumbnail: c.input.thumbnail, hash: c.input.imageHash! }; out.selection = "operator"; }
      if (c.input.pageUrl) {
        const article = await pages.page(c.input.pageUrl, signal);
        out.inputExcerpt = excerpt(article.excerpt); out.signals.push(...article.securitySignals ?? []);
        const selected = c.input.imageUrl ? article.images.find(i => i.url === c.input.imageUrl) : article.images[0];
        if (c.input.imageUrl && !selected) throw new CaseError("image_not_on_page", "선택한 이미지가 제출한 페이지에 없어요.");
        if (!out.inputImage && selected) {
          const img = await pages.image(selected.url, signal);
          out.inputImage = await imageData(selected.url, img.bytes);
          out.selection = c.input.imageUrl ? "operator" : "representative_unconfirmed";
        }
      }
      const urls = [...new Set([...c.input.candidateUrls, ...(c.input.feedReview ? [c.input.feedReview.url] : [])])];
      for (const url of urls) {
        const v = await verifier.verify({ url, provider: "operator-selected" }, signal);
        if (v.images.length < Math.min(2, v.article.images.length)) throw new CaseError("candidate_image_failed", "후보 이미지 일부를 가져오지 못했어요. OSINT에서 멈췄어요.");
        out.signals.push(...v.article.securitySignals ?? []);
        out.candidates.push({ url: v.article.url, excerpt: excerpt(v.article.excerpt), dates: v.dates,
          images: await Promise.all(v.images.map(i => imageData(i.url, i.bytes))), ...(v.article.review ? { review: v.article.review } : {}) });
      }
      out.signals = [...new Set(out.signals)];
      return { data: { ...out } };
    }),
    ai_data: make("ai_data", async (c, signal) => {
      const source = sectionData<OsintData>(c, "osint");
      if (!source.inputImage) {
        return { data: { collected: { matches: [], evidence: [], searchedProviders: [], verification: { sources: [], factChecks: [], warnings: ["비교할 이미지 없음"], discoveryComplete: false, verificationComplete: false } },
          imageMissing: true, thumbnailOnly: true, warnings: ["기사에 비교할 이미지가 없어요. 이미지 진위는 판단할 수 없어요."] } satisfies AnalysisData };
      }
      const candidates: VerifiedCandidate[] = source.candidates.map(v => ({ candidate: { url: v.url, provider: "operator-selected" },
        article: { url: v.url, title: "", excerpt: v.excerpt, dates: v.dates, images: [], ...(v.review ? { review: v.review } : {}) },
        dates: v.dates.map(d => ({ ...d, imageBound: false })), images: v.images.map(i => ({ url: i.url, bytes: bytes(i.thumbnail), mime: "image/png" })) }));
      if (candidates.some(v => !v.images.length)) throw new CaseError("candidate_without_image", "원본 후보 페이지에 비교할 이미지가 없어요.");
      const p: Providers = {
        pages, input: new NormalizingInputProvider(pages),
        reverseSearch: { name: "manual-candidates", search: async () => ({ candidates: candidates.map(v => v.candidate), searchedProviders: ["운영자 지정 후보"] }) },
        factCheck: { name: "image-search-not-connected", search: async () => [] },
        temporaryImages: { name: "local-only", publish: async () => ({ url: "https://unused.invalid/local", expiresAt: new Date().toISOString(), revoke: async () => {} }) },
        candidates: { name: "verified-case-snapshot", verify: async candidate => candidates.find(v => v.candidate.url === candidate.url)! },
        images, provenance: new LocalMetadataProvider(), context: { name: "not-requested", compare: async () => [] },
        verdict: { name: "v3", decide: i => decideVerdict({ ...i, trustedSources: loadTrustedSources() }) },
        urls: { name: pages.name, listImages: async (u, s) => (await pages.page(u, s)).images, fetchImage: (u, s) => pages.image(u, s) },
      };
      const b = bytes(source.inputImage.thumbnail);
      const collected = await collectEvidence({ image: { bytes: b, mime: "image/png", sha256: hash(b), publicUrl: null },
        thumbnail: { bytes: b, mime: "image/png" }, article: null, thumbnailOnly: true }, p, signal);
      if (!collected.verification.verificationComplete) throw new CaseError("comparison_incomplete", "후보 비교를 완료하지 못했어요. 이 단계에서 멈췄어요.");
      collected.evidence.push(...c.input.provenance);
      if (c.input.feedReview) collected.evidence.push({ kind: "fact_check", strength: "medium", outcome: "neutral", score: null,
        sourceUrl: c.input.feedReview.url, provider: "Google Fact Check claims:search",
        summary: "기존 팩트체크 링크가 있어요. 유포 이미지·주장의 동일성을 확인하기 전에는 판정 근거로 사용하지 않아요.",
        details: { claimMatched: false, imageMatched: false, pageVerified: false } });
      collected.verification.discoveryComplete = false; // manual search never proves that no original exists on the web
      return { data: { collected, imageMissing: false, thumbnailOnly: true, warnings: ["512px 이하 썸네일 비교. 미세 편집·원본 출처 검증에는 한계가 있어요.", "역이미지/Fact Check 이미지 검색은 이번 흐름에 미연결"] } satisfies AnalysisData };
    }),
    security: make("security", async c => {
      const o = sectionData<OsintData>(c, "osint");
      const repeated = repo.list(Boolean(options.allowTestProviders)).filter(x => duplicateKey(x) === duplicateKey(c)).length;
      return { data: { instructionSignals: [...new Set([...o.signals, ...instructionSignals(o.inputExcerpt)])],
        repeatedReports: repeated, repeated: repeated >= 3, scope: "내부 제보만 검사. 외부 SNS 계정·봇 추적 없음", requiresHumanReview: o.signals.length > 0 || repeated >= 3 } };
    }),
    factcheck: make("factcheck", async (c, signal) => {
      const a = sectionData<AnalysisData>(c, "ai_data"), o = sectionData<OsintData>(c, "osint");
      const judge = decideVerdict({ evidence: a.collected.evidence, matches: a.collected.matches, claimedDate: c.input.claimedDate,
        claimText: c.input.claim, trustedSources: loadTrustedSources() });
      // A page's hero photo is not automatically the circulated image. Code owns this conservative guard.
      if (o.selection !== "operator") Object.assign(judge, { verdict: "inconclusive", rule: "case.image_identity_unconfirmed", strength: null,
        reason: "유포 주장에 사용된 이미지인지 확인하지 못했어요.", missing: ["운영자가 선택한 주장 이미지"] });
      const selection = process.env.PAIRSIGHT_LLM ?? "ollama";
      if (!options.allowTestProviders && (selection === "mock" || options.llm?.name.includes("mock"))) throw new CaseError("mock_forbidden", "실제 사건에 mock 법정을 사용할 수 없어요. 로컬 LLM 설정을 확인해 주세요.");
      const llm = options.llm ?? createLLMProvider(selection, { baseUrl: process.env.PAIRSIGHT_OLLAMA_URL ?? "http://127.0.0.1:11500", numThread: 4 });
      const court = await runCourt({ verdict: judge, evidence: a.collected.evidence, matches: a.collected.matches }, llm, signal);
      if (court.incomplete.length || court.reviewStatus === "unavailable") throw new CaseError("court_incomplete", "맥락·법정 확인 못 함. 제공자 상태를 확인한 후 이 부서에서 다시 실행해 주세요.");
      court.rejected = court.rejected.map(r => ({ ...r, text: "" }));
      return { data: { court, rule: judge.rule, calls: court.llmCalls } };
    }),
    legal: make("legal", async c => ({ data: { warnings: legalWarnings(c, sectionData<OsintData>(c, "osint")), decisionAuthority: "human-only" } })),
    trust_safety: make("trust_safety", async c => ({ data: { requiredReviews: sectionData<{ topic: Topic }>(c, "monitoring").topic === "politics" ? 2 : 1,
      warnings: sectionData<{ warnings: string[] }>(c, "legal").warnings }, waitForApproval: true })),
    communications: make("communications", async c => {
      const court = sectionData<FactcheckData>(c, "factcheck").court, o = sectionData<OsintData>(c, "osint");
      const [first, second] = c.approvals;
      if (!first) throw new CaseError("approval_required", "사람 승인이 필요해요.");
      const draft: PublicCase = { id: c.id, slug: c.id, topic: sectionData<{ topic: Topic }>(c, "monitoring").topic, verdict: court.finalVerdict,
        channels: c.input.channels, truthTitle: first.title, summary: first.summary,
        imagePath: c.input.rightsConfirmed && !c.input.contentFlags.includes("election_period") && !c.input.contentFlags.includes("graphic_violence") ? o.inputImage?.thumbnail ?? null : null,
        imageAlt: "운영자가 확인한 제보 이미지", court: { opened: court.opened, judgeVerdict: court.judgeVerdict, judgeReason: court.docket.judge.reason,
          finalVerdict: court.finalVerdict, downgraded: court.downgraded, prosecution: court.prosecution, defense: court.defense, jurors: court.jurors,
          rejectedCount: court.rejected.length, rejected: court.rejected.map(r => ({ role: r.role, reason: r.reason })), judgment: court.judgment },
        cards: court.docket.cards.map(({ untrustedPageText: _unused, ...card }) => ({ ...card, sourceUrl: card.sourceUrl })),
        contentFlags: c.input.contentFlags, legalWarnings: sectionData<{ warnings: string[] }>(c, "legal").warnings,
        approvalStatus: "approved", reviewedBy: first.operatorId, reviewedAt: first.at, secondReviewedBy: second?.operatorId ?? null, secondReviewedAt: second?.at ?? null,
        publishedAt: new Date().toISOString(), example: false };
      if (publishProblems(draft).length) throw new CaseError("publication_blocked", "게재 조건을 충족하지 못했어요. 사람 검토가 필요해요.");
      return { data: { publicCase: draft } };
    }),
    literacy: make("literacy", async c => {
      const p = structuredClone(sectionData<{ publicCase: PublicCase }>(c, "communications").publicCase);
      p.court.judgment.howToCheck = [...new Set([...p.court.judgment.howToCheck, "페이지 게시일과 사진 촬영일은 다를 수 있어요. 날짜의 출처를 확인하세요.",
        "판단 불가는 진짜라는 뜻이 아니에요. 확인되지 않은 자료는 재유포하지 마세요."])];
      return { data: { publicCase: p, howToCheck: p.court.judgment.howToCheck } };
    }),
  };
}
