// Public dashboard read side: only approved, policy-clean cases reach a page (mirrors public_cases RLS + constraints).
import { describe, expect, it } from "vitest";
import { allCasesForTests, getPublicCase, listPublicCases } from "../lib/public/store";
import { isBlurred, publishProblems, type PublicCase } from "../lib/public/types";

const all = allCasesForTests();
const ok = all.find((c) => c.slug === "alley-house-sold-sign")!;

describe("public cases", () => {
  it("lists approved cases only; pending, rejected and flagged cases never appear", () => {
    const slugs = listPublicCases().map((c) => c.slug);
    expect(slugs).toEqual(["alley-house-sold-sign", "park-festival-not-flood", "desert-lantern-concert-ai", "sale-cafe-sign-edited", "rally-crowd-no-evidence"]);
    for (const hidden of ["pending-market-photo", "rejected-example", "blocked-sexual-flag"]) {
      expect(slugs).not.toContain(hidden);
      expect(getPublicCase(hidden)).toBeNull();
    }
  });

  it("sexual content stays hidden even when marked approved", () => {
    const flagged = all.find((c) => c.slug === "blocked-sexual-flag")!;
    expect(flagged.approvalStatus).toBe("approved");
    expect(publishProblems(flagged)).toContain("성적 콘텐츠·미성년자 관련은 게재 불가");
    expect(flagged.imagePath).toBeNull();
  });

  it("enforces the same rules as the database constraints", () => {
    const v = (patch: Partial<PublicCase>) => publishProblems({ ...ok, ...patch });
    expect(v({})).toEqual([]);
    expect(v({ reviewedBy: null })).toContain("검토자 기록 없음");
    expect(v({ topic: "politics", secondReviewedBy: null })).toContain("정치·선거는 서로 다른 검토자 2명 필요");
    expect(v({ topic: "politics", secondReviewedBy: ok.reviewedBy, secondReviewedAt: ok.reviewedAt })).toContain("정치·선거는 서로 다른 검토자 2명 필요");
    expect(v({ contentFlags: ["minor"] })).toContain("성적 콘텐츠·미성년자 관련은 게재 불가");
    expect(v({ contentFlags: ["private_person"] })).toContain("사인(私人)은 게재 대상 아님");
    expect(v({ contentFlags: ["election_period"] })).toContain("선거 기간 정치 사례는 이미지 없이만 게재");
    expect(v({ verdict: "authentic" })).toContain("판정이 공방 기록과 다름");
  });

  it("filters by topic, manipulation type and spread channel", () => {
    expect(listPublicCases({ topic: "economy" }).map((c) => c.slug)).toEqual(["alley-house-sold-sign", "sale-cafe-sign-edited"]);
    expect(listPublicCases({ verdict: "miscontextualized" }).map((c) => c.slug)).toEqual(["park-festival-not-flood"]);
    expect(listPublicCases({ channel: "youtube" }).map((c) => c.slug)).toEqual(["desert-lantern-concert-ai"]);
    expect(listPublicCases({ topic: "politics", verdict: "edited" })).toEqual([]);
  });

  it("every published statement cites existing cards, no page text is published, fakes are blurred", () => {
    for (const c of listPublicCases()) {
      const ids = new Set(c.cards.map((k) => k.id));
      const statements = [...c.court.prosecution, ...c.court.defense, ...c.court.jurors.flatMap((j) => (j.doubt ? [j.doubt] : [])), ...c.court.judgment.remainingDoubts];
      for (const s of statements) for (const id of s.cite) expect(ids.has(id), `${c.slug} ${id}`).toBe(true);
      expect(JSON.stringify(c)).not.toContain("untrustedPageText");
      expect(isBlurred(c.verdict)).toBe(true);
      expect(c.example).toBe(true);
    }
    expect(listPublicCases().find((c) => c.topic === "politics")!.secondReviewedBy).not.toBeNull();
  });
});
