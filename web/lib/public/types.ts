// Public dashboard model (replica/public-dashboard.md, replica/category-policy.md). Mirrors public_cases in
// replica/schema.sql; the publish rules below repeat the table's constraints so the memory store and the database
// refuse the same cases.
import type { Verdict } from "../domain";
import type { Card } from "../court/docket";
import type { Judgment, JurorResult, Alternative, Argument } from "../court/court";

export const TOPICS = [
  { id: "politics", label: "정치·선거" },
  { id: "entertainment", label: "연예·엔터" },
  { id: "society", label: "사회·재난" },
  { id: "economy", label: "경제" },
  { id: "other", label: "기타" },
] as const;
export type Topic = (typeof TOPICS)[number]["id"];

export const CHANNELS = [
  { id: "instagram", label: "인스타그램" },
  { id: "youtube", label: "유튜브" },
  { id: "community", label: "커뮤니티" },
  { id: "messenger", label: "메신저" },
  { id: "news", label: "기사" },
] as const;
export type Channel = (typeof CHANNELS)[number]["id"];

/** Filter "조작 유형". 진짜 확인 cases may be published but are not a filter of their own. */
export const FILTER_VERDICTS = ["ai_generated", "edited", "miscontextualized", "inconclusive"] as const satisfies readonly Verdict[];

export type ApprovalStatus = "draft" | "pending_review" | "approved" | "rejected" | "withdrawn";
export type ContentFlag = "sexual_content" | "minor" | "private_person" | "graphic_violence" | "election_period";

/** What the public may see of a hearing: validated statements only, no page text, no rejected speech. */
export interface PublicCourtRecord {
  opened: boolean;
  judgeVerdict: Verdict;
  judgeReason: string;
  finalVerdict: Verdict;
  downgraded: boolean;
  prosecution: Argument[];
  defense: Alternative[];
  jurors: JurorResult[];
  rejectedCount: number;
  rejected: { role: string; reason: string }[]; // code-written reasons only; the discarded text is not published
  judgment: Judgment;
}

export interface PublicCase {
  id: string;
  slug: string;
  topic: Topic;
  verdict: Verdict;
  channels: Channel[]; // report-based tags; nothing is collected from platforms
  truthTitle: string; // the true statement, never the false claim
  summary: string;
  imagePath: string | null;
  imageAlt: string;
  court: PublicCourtRecord;
  cards: Omit<Card, "untrustedPageText">[];
  contentFlags: ContentFlag[];
  legalWarnings: string[];
  approvalStatus: ApprovalStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  secondReviewedBy: string | null;
  secondReviewedAt: string | null;
  publishedAt: string | null;
  example: boolean; // fictional demo case built from synthetic fixtures
}

/** Same rules as the public_cases constraints. Returns the reasons a case may not be shown. */
export function publishProblems(c: PublicCase): string[] {
  const out: string[] = [];
  if (c.approvalStatus !== "approved") out.push("운영자 승인 전");
  if (!c.reviewedBy || !c.reviewedAt || !c.publishedAt) out.push("검토자 기록 없음");
  if (c.topic === "politics" && (!c.secondReviewedBy || c.secondReviewedBy === c.reviewedBy || !c.secondReviewedAt)) out.push("정치·선거는 서로 다른 검토자 2명 필요");
  if (c.contentFlags.includes("sexual_content") || c.contentFlags.includes("minor")) out.push("성적 콘텐츠·미성년자 관련은 게재 불가");
  if (c.contentFlags.includes("private_person")) out.push("사인(私人)은 게재 대상 아님");
  if (c.contentFlags.includes("election_period") && c.imagePath) out.push("선거 기간 정치 사례는 이미지 없이만 게재");
  if (c.court.finalVerdict !== c.verdict) out.push("판정이 공방 기록과 다름");
  return out;
}

/** Fake or unconfirmed pictures are blurred everywhere on the public site. */
export const isBlurred = (v: Verdict) => v !== "authentic";

export const topicLabel = (t: Topic) => TOPICS.find((x) => x.id === t)!.label;
export const channelLabel = (c: Channel) => CHANNELS.find((x) => x.id === c)!.label;
