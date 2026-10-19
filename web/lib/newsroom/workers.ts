import { FactCheckArticleDiscovery, GeminiSearchDiscovery, type CandidateDiscoveryProvider } from "./candidate-discovery";
import type { ReverseSearchProvider } from "../providers/types";
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
  discovery?: { provider: string; found: number; warning?: string }[];
  candidates: { url: string; provider?: string; excerpt: string; dates: Article["dates"]; images: SavedImage[] }[];
  signals: string[];
  scope: string;
}
export interface AnalysisData { collected: Collected; imageMissing: boolean; thumbnailOnly: boolean; warnings: string[] }
export interface FactcheckData { court: CourtRecord; rule: string; calls: number }
const bytes = (data: string) => Buffer.from(data.split(",")[1], "base64");
const imageData = async (url: string, b: Uint8Array): Promise<SavedImage> => ({ url, hash: hash(b), thumbnail: "data:image/png;base64," + Buffer.from(await thumbnail(b)).toString("base64") });
/** A feed item's text already uses part of the per-page 200-character retention budget. */
function retainedExcerpt(c:Readonly<CaseRecord>,url:string,text:string) {
  const f=c.input.feedReview;
  const used=f?.url===url?[...c.input.claim+f.publisher+f.rating].length:0;
  return [...excerpt(text)].slice(0,Math.max(0,200-used)).join("");
}
export function classify(text: string): Topic {
  if (/선거|정당|대통령|국회|정치|투표|개표/.test(text)) return "politics";
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
  pages?: PageFetchProvider; images?: ImageComparisonProvider; llm?: LLMProvider; allowTestProviders?: boolean; reverseSearch?: ReverseSearchProvider; discovery?: CandidateDiscoveryProvider;
} = {}): Workers {
  const pages = options.pages ?? new OnDemandPageProvider(new PolicyFetch(guardedTransport, 1000));
  const images = options.images ?? new LocalImageComparisonProvider();
  const verifier = new OnDemandCandidateVerifier(pages, { name: "archive-not-connected", firstCapture: async () => null }, 6);
  const make = <D extends keyof Workers>(department: D, run: Workers[D]["run"]) => ({ department, run });
  return {
    monitoring: make("monitoring", async c => {
      const key = duplicateKey(c), others = repo.list(Boolean(options.allowTestProviders)).filter(x => x.id !== c.id && duplicateKey(x) === key);
      return { data: { topic: c.input.topic ?? classify(c.input.claim), method: c.input.topic ? "operator" : "keyword_rules",
        duplicateGroup: key, duplicateCaseIds: others.map(x => x.id), reportCount: others.length + 1 } };
    }),
    osint: make("osint", async (c, signal) => {
      const out: OsintData = { inputImage: null, selection: "none", inputExcerpt: "", candidates: [], signals: [], scope: "운영자가 지정한 후보/팩트체크 링크만 검증. 웹 전체 검색·자체 색인 없음" };
      if (c.input.contentFlags.includes("sexual_content")) return { data: { ...out, scope: "성적 합성물 신고 전용: 페이지·이미지 가져오기 및 표시 금지" } };
      if (c.input.thumbnail) { out.inputImage = { url: "", thumbnail: c.input.thumbnail, hash: c.input.imageHash! }; out.selection = "operator"; }
      if (c.input.pageUrl) {
        const article = await pages.page(c.input.pageUrl, signal);
        out.inputExcerpt = retainedExcerpt(c,article.url,article.excerpt); out.signals.push(...article.securitySignals ?? []);
        const selected = c.input.imageUrl ? article.images.find(i => i.url === c.input.imageUrl) : article.images[0];
        if (c.input.imageUrl && !selected) throw new CaseError("image_not_on_page", "선택한 이미지가 제출한 페이지에 없어요.");
        if (!out.inputImage && selected) {
          const img = await pages.image(selected.url, signal);
          out.inputImage = await imageData(selected.url, img.bytes);
          out.selection = c.input.imageUrl ? "operator" : "representative_unconfirmed";
        }
      }
      const feedName = "Google Fact Check claims:search";
      const discoveries: NonNullable<OsintData["discovery"]> = [];
      let discovered: import("../verification/types").Candidate[] = [
        ...(c.input.feedReview ? [{url:c.input.feedReview.url,provider:feedName}] : []),
        ...c.input.candidateUrls.map(url=>({url,provider:"operator-selected"})),
      ];
      // Feed imports already carry their review URL. Other submissions can query the same
      // bounded Korean monitoring feed; no publisher assessment enters this projection.
      const finder=options.discovery??(!options.allowTestProviders&&process.env.GOOGLE_FACTCHECK_API_KEY&&!c.input.feedReview?new FactCheckArticleDiscovery(repo):null);
      if(finder&&out.inputImage){
        try { const found=await finder.discover({claim:c.input.claim},signal);discovered.push(...found);discoveries.push({provider:finder.name,found:found.length}); }
        catch { signal.throwIfAborted();discoveries.push({provider:finder.name,found:0,warning:"팩트체크 후보 검색을 완료하지 못했어요. 키·한도를 확인하거나 후보 링크를 보충해 주세요."}); }
      }
      // Compatibility seam for test/independently licensed reverse-search providers.
      if(!discovered.length&&out.inputImage&&options.reverseSearch){
        const found=await options.reverseSearch.search({bytes:bytes(out.inputImage.thumbnail),mime:"image/png",sha256:out.inputImage.hash,publicUrl:out.inputImage.url||null},signal);
        discovered=found.candidates;
      }
      discovered=[...new Map(discovered.map(c=>[c.url,c])).values()];
      if(discovered.length>5)discoveries.push({provider:"request-limit",found:discovered.length,warning:"요청당 후보 페이지 5개까지만 확인했어요."});
      discovered=discovered.slice(0,5);
      out.discovery=discoveries;
      out.scope="수동·팩트체크 기사 후보를 요청 시점에 robots 준수 검증. Gemini 검색 자동 수집은 약관상 비활성. 다른 기관의 판정은 근거에서 제외";
      if(!discovered.length&&out.inputImage&&!options.allowTestProviders){
        await new GeminiSearchDiscovery(repo).discover({claim:c.input.claim},signal);
      }
      for (const candidate of discovered) {
        const v = await verifier.verify(candidate, signal);
        if (v.images.length < Math.min(6, v.article.images.length)) throw new CaseError("candidate_image_failed", "후보 이미지 일부를 가져오지 못했어요. OSINT에서 멈췄어요.");
        out.signals.push(...v.article.securitySignals ?? []);
        out.candidates.push({ url: v.article.url, provider: candidate.provider, excerpt: candidate.provider===feedName || v.article.review ? "" : retainedExcerpt(c,v.article.url,v.article.excerpt), dates: v.dates,
          images: await Promise.all(v.images.map(i => imageData(i.url, i.bytes))) });
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
      const independent = source.candidates.filter(v => !(source.selection === "representative_unconfirmed" && v.url === c.input.pageUrl));
      const circularExcluded = independent.length < source.candidates.length;
      const candidates: VerifiedCandidate[] = independent.map(v => ({ candidate: { url: v.url, provider: v.provider??"operator-selected" },
        article: { url: v.url, title: "", excerpt: v.excerpt, dates: v.dates, images: [] },
        dates: v.dates.map(d => ({ ...d, imageBound: false })), images: v.images.map(i => ({ url: i.url, bytes: bytes(i.thumbnail), mime: "image/png" })) }));
      if (candidates.some(v => !v.images.length)) throw new CaseError("candidate_without_image", "원본 후보 페이지에 비교할 이미지가 없어요.");
      const p: Providers = {
        pages, input: new NormalizingInputProvider(pages),
        reverseSearch: { name: "case-candidates", search: async () => ({ candidates: candidates.map(v => v.candidate), searchedProviders: [...new Set(candidates.map(v=>v.candidate.provider))] }) },
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
      collected.verification.discoveryComplete = false; // manual search never proves that no original exists on the web
      return { data: { collected, imageMissing: false, thumbnailOnly: true, warnings: [...(circularExcluded ? ["유포 사진을 지정하지 않은 기사 대표 이미지의 자기 비교는 근거에서 제외했어요."] : []),...(source.discovery??[]).flatMap(d=>d.warning?[d.warning]:[]),...collected.verification.warnings,"512px 이하 썸네일 비교. 미세 편집·원본 출처 검증에는 한계가 있어요.", "유한한 후보 검색으로 웹 전체에 원본이 없음을 증명하지 못해요. Fact Check 이미지 검색은 미연결"] } satisfies AnalysisData };
    }),
    security: make("security", async c => {
      // Intake can inspect submissions before OSINT. Research adds page signals after fetching.
      const o = c.sections.osint?.state === "done" ? sectionData<OsintData>(c, "osint") : { signals: [], inputExcerpt: c.input.claim };
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
      const court = await runCourt({ verdict: judge, evidence: a.collected.evidence, matches: a.collected.matches }, llm, signal, {onEvent:event=>{
        signal.throwIfAborted();
        repo.mutate(c.id,(current,emit)=>{
          if(!c.run || current.run?.token!==c.run.token)throw new CaseError("stale_run","작업 소유권이 바뀌었어요.");
          emit({department:"factcheck",actor:event.seat,state:event.status==="speaking"?"speaking":event.status==="working"?"agent_working":"agent_idle",
            summary:excerpt(event.summary??event.seat+" · "+event.status),cite:event.cite});
        });
      }});
      if (court.incomplete.length || court.reviewStatus === "unavailable") throw new CaseError("court_incomplete", "맥락·법정 확인 못 함. 제공자 상태를 확인한 후 이 부서에서 다시 실행해 주세요.", {llmCalls:court.llmCalls});
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
        cards: court.docket.cards.map(({ untrustedPageText, ...card }) => { void untrustedPageText; return card; }),
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
