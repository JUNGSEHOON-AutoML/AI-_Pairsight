import type { Candidate } from "../verification/types";
import type { CaseRepository } from "./repository";
import { CaseError } from "./model";
import { searchFeed } from "./feed-service";

/** Discovery returns pointers, never assessments or evidence. Images are deliberately absent. */
export interface CandidateDiscoveryProvider {
  readonly name: string;
  discover(input: { claim: string }, signal: AbortSignal): Promise<Candidate[]>;
}
export const GROUNDING_BLOCK_REASON = "Gemini 검색 약관상 URL 자동 수집·페이지 검증 연결을 사용할 수 없어요. 원본 후보 링크를 보충해 주세요.";

/**
 * Fail-closed contract, NOT a functioning Google Search client.
 * Gemini API terms (2026-10-20) prohibit programmatically collecting Links
 * or using them to identify pages for crawling/scraping. No env toggle bypasses this.
 */
export class GeminiSearchDiscovery implements CandidateDiscoveryProvider {
  readonly name = "Gemini Search (disabled by terms)";
  constructor(private repo: CaseRepository) {
    repo.db.exec("CREATE TABLE IF NOT EXISTS grounding_daily(day TEXT PRIMARY KEY, calls INTEGER NOT NULL CHECK(calls>=0))");
  }
  usage(now = new Date()) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const row = this.repo.db.prepare("SELECT calls FROM grounding_daily WHERE day=?").get(day) as {calls:number}|undefined;
    return { day, calls: row?.calls ?? 0, limit: 0, status: "terms_blocked" as const };
  }
  async discover(_input: { claim: string }, signal: AbortSignal): Promise<Candidate[]> {
    signal.throwIfAborted();
    // Never inspect/upload an image, invoke Gemini, or retain the prompt.
    throw new CaseError("candidate_required", GROUNDING_BLOCK_REASON);
  }
}
export class FactCheckArticleDiscovery implements CandidateDiscoveryProvider {
  readonly name = "Google Fact Check claims:search";
  constructor(private repo: CaseRepository) {}
  async discover(input: { claim: string }, signal: AbortSignal): Promise<Candidate[]> {
    signal.throwIfAborted();
    const result = await searchFeed(this.repo, input.claim.trim().slice(0, 100), signal);
    signal.throwIfAborted();
    return [...new Set(result.items.map(item => item.url))].slice(0, 5).map(url => ({ url, provider: this.name }));
  }
}
