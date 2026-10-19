import { CaseError } from "./model";
import { excerpt, publicUrl } from "../verification/retention";
import { maskLLMSecrets } from "../llm/errors";
export interface FeedClaim { id: string; claim: string; url: string; publisher: string; rating: string; reviewedAt: string | null }
const safeText = (v: unknown) => excerpt(maskLLMSecrets(typeof v === "string" ? v : ""));
export class GoogleFactCheckFeed {
  constructor(private transport: typeof fetch = fetch) {}
  async search(query: string, signal: AbortSignal): Promise<FeedClaim[]> {
    const key = process.env.GOOGLE_FACTCHECK_API_KEY;
    if (!key) throw new CaseError("factcheck_key_missing", "Google Fact Check API 키가 설정되지 않았어요.");
    const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
    url.searchParams.set("key", key); url.searchParams.set("languageCode", "ko");
    url.searchParams.set("query", query.trim().slice(0, 100)); url.searchParams.set("pageSize", "10");
    let response: Response;
    try { response = await this.transport(url, { signal, redirect: "error" }); }
    catch { throw new CaseError("factcheck_network", "Fact Check 검색에 연결하지 못했어요. 자동 재시도는 하지 않아요."); }
    if (!response.ok) {
      // Never read/log upstream error bodies, request URLs or headers.
      await response.body?.cancel();
      throw new CaseError(response.status === 429 ? "factcheck_rate_limit" : "factcheck_auth_or_service",
        response.status === 429 ? "Fact Check 한도에 도달했어요. 자동 재시도하지 않아요." : "Fact Check 인증 또는 API 사용 설정을 확인해 주세요.");
    }
    let data: { claims?: { text?: unknown; claimReview?: { url?: unknown; publisher?: { name?: unknown }; textualRating?: unknown; reviewDate?: unknown }[] }[] };
    try {
      const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 1_000_000) { await reader.cancel(); throw Error("size"); } chunks.push(value); }
      data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw new CaseError("factcheck_response", "Fact Check 응답 형식을 확인하지 못했어요."); }
    const results: FeedClaim[] = [];
    for (const c of (Array.isArray(data.claims) ? data.claims : []).slice(0, 10)) {
      for (const r of (Array.isArray(c.claimReview) ? c.claimReview : []).slice(0, 2)) {
        const link = typeof r.url === "string" ? publicUrl(r.url) : null;
        if (!link) continue;
        const publisher = safeText(r.publisher?.name).slice(0, 35), rating = safeText(r.textualRating).slice(0, 30);
        const claim = [...safeText(c.text)].slice(0, Math.max(0, 190 - [...publisher].length - [...rating].length)).join("");
        results.push({ id: link, url: link, publisher, rating, claim,
          reviewedAt: typeof r.reviewDate === "string" && Number.isFinite(Date.parse(r.reviewDate)) ? new Date(r.reviewDate).toISOString() : null });
      }
    }
    return results;
  }
}
