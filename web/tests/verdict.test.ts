import { describe, expect, it } from "vitest";
import type { Evidence } from "../lib/domain";
import { SCENARIO_DATA } from "../lib/providers/mock/fixtures";
import { decideVerdict, sortEvidence } from "../lib/verdict";

const run = (s: keyof typeof SCENARIO_DATA, claimedDate: string | null = null) =>
  decideVerdict({ evidence: SCENARIO_DATA[s].evidence, matches: SCENARIO_DATA[s].matches, claimedDate });

describe("fixtures reproduce every verdict", () => {
  it.each([
    ["authentic", "authentic"],
    ["ai_generated", "ai_generated"],
    ["edited", "edited"],
    ["miscontextualized", "miscontextualized"],
    ["inconclusive", "inconclusive"],
    ["no_source", "inconclusive"],
  ] as const)("%s → %s", (scenario, verdict) => {
    expect(run(scenario).verdict).toBe(verdict);
  });

  it("원본 없음 lists the missing source and provenance", () => {
    expect(run("no_source").missing).toEqual(["같은 사진의 다른 기록이 없어요", "파일에 출처 기록(C2PA)이 없어요"]);
  });

  it("판단 불가 with a loose match says it is not the same picture and has no date", () => {
    expect(run("inconclusive").missing).toContain("찾은 사진이 넣은 이미지와 충분히 같지 않아요");
    expect(run("inconclusive").missing).toContain("날짜를 확인하지 못했어요");
  });
});

describe("rules", () => {
  const pixel = (score: number): Evidence => ({
    kind: "pixel_model",
    outcome: "supports_manipulated",
    strength: "weak",
    score,
    summary: "",
    details: {},
    sourceUrl: null,
    provider: "t",
  });

  it("a high AI-detector score alone never decides", () => {
    expect(decideVerdict({ evidence: [pixel(99)], matches: [], claimedDate: null }).verdict).toBe("inconclusive");
  });

  it("an identical older copy becomes 맥락 조작 when the user's date is later", () => {
    const m = { ...SCENARIO_DATA.authentic.matches[0] }; // first seen 2024-05-10
    const r = decideVerdict({ evidence: SCENARIO_DATA.authentic.evidence, matches: [m], claimedDate: "2026-10-01" });
    expect(r.verdict).toBe("miscontextualized");
    expect(r.reason).toContain("2024-05-10");
    expect(r.reason).toContain("페이지에 적힌 게시일");
  });

  it("the same picture with no date stays 판단 불가, never 진짜 확인", () => {
    const m = { ...SCENARIO_DATA.authentic.matches[0], firstSeenAt: null, firstSeenSource: null };
    const r = decideVerdict({ evidence: [], matches: [m], claimedDate: null });
    expect(r.verdict).toBe("inconclusive");
    expect(r.missing).toContain("날짜를 확인하지 못했어요");
  });

  it("no wording ever says 최초 게시일", () => {
    for (const s of Object.keys(SCENARIO_DATA) as (keyof typeof SCENARIO_DATA)[]) {
      expect(JSON.stringify(run(s))).not.toContain("최초 게시일");
    }
  });

  it("evidence sorts strongest first, then 원본 일치 → C2PA → 워터마크 → … → AI 탐지", () => {
    const kinds = sortEvidence(SCENARIO_DATA.authentic.evidence).map((e) => e.kind);
    expect(kinds).toEqual(["source_match", "c2pa", "watermark", "pixel_model"]);
    const mis = sortEvidence(SCENARIO_DATA.miscontextualized.evidence).map((e) => e.kind);
    expect(mis[0]).toBe("fact_check");
    expect(mis.at(-1)).toBe("pixel_model");
  });

  it("every pixel_model fixture is weak (schema constraint pixel_model_is_weak)", () => {
    for (const d of Object.values(SCENARIO_DATA)) {
      for (const e of d.evidence) if (e.kind === "pixel_model") expect(e.strength).toBe("weak");
    }
  });
});
