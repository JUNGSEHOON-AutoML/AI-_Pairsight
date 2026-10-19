// Every fixture through the real pipeline (page extraction + pixel comparison), judged twice on the same evidence:
// v2 = no trusted list, v3 = the list the mock app uses (production list + fictional .test domains).
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createMockProviders } from "../lib/providers";
import { MOCK_FIXTURE_INPUT, SCENARIOS, type Scenario } from "../lib/providers/mock/fixtures";
import { decideVerdict } from "../lib/verdict";
import { compareContext, collectEvidence } from "../lib/verification/engine";
import { EMPTY_TRUSTED_LIST, loadTrustedSources } from "../lib/verification/trusted-sources";

const signal = () => AbortSignal.timeout(30000);

async function judge(s: Scenario) {
  const p = createMockProviders();
  const input = await p.input.normalize({ bytes: await readFile(`public/fixtures/inputs/${s}.png`), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal());
  const c = await collectEvidence(input, p, signal());
  const extra = MOCK_FIXTURE_INPUT[s] ?? {};
  const context = await compareContext({ text: extra.claimText ?? "", date: extra.claimedDate ?? null }, c, p, signal());
  const base = { evidence: [...c.evidence, ...context], matches: c.matches, claimedDate: extra.claimedDate ?? null, claimText: extra.claimText };
  return {
    c,
    v2: decideVerdict({ ...base, trustedSources: EMPTY_TRUSTED_LIST }),
    v3prod: decideVerdict({ ...base, trustedSources: loadTrustedSources() }),
    v3mock: decideVerdict({ ...base, trustedSources: loadTrustedSources({ includeMock: true }) }),
  };
}

describe("v2 vs v3 on every fixture", () => {
  it("changes exactly the two trusted-source fixtures, and only under the fixture (mock) list", async () => {
    const rows: string[] = [];
    const changed: Record<string, string> = {};
    for (const s of SCENARIOS.filter((x) => x !== "provider_timeout")) {
      const { v2, v3prod, v3mock } = await judge(s);
      expect(v3prod.verdict, `${s}: production list must not change fixtures (they use .test domains)`).toBe(v2.verdict);
      rows.push(`${s.padEnd(18)} v2=${v2.verdict.padEnd(17)} v3=${v3mock.verdict.padEnd(17)} rule=${v3mock.rule} strength=${v3mock.strength ?? "-"}`);
      if (v2.verdict !== v3mock.verdict) changed[s] = `${v2.verdict} → ${v3mock.verdict}`;
    }
    if (process.env.FIXTURE_TABLE_OUT) writeFileSync(process.env.FIXTURE_TABLE_OUT, rows.join("\n") + "\n");
    expect(changed).toEqual({ trusted_edited: "inconclusive → edited", trusted_context: "inconclusive → miscontextualized" });
  });

  it("trusted_edited: real comparison finds a local difference on the trusted page", async () => {
    const { c, v3mock } = await judge("trusted_edited");
    const m = c.matches[0];
    expect(m.url).toBe("https://wire.example.test/2021/04/old-house");
    expect(m.comparison?.matched).toBe(true);
    expect(m.comparison!.diffRegions.length).toBeGreaterThan(0);
    expect(m.comparison!.changedFraction).toBeLessThanOrEqual(0.25);
    expect(v3mock).toMatchObject({ rule: "v3.trusted_edited", strength: "medium" });
    expect(v3mock.headlineFinding?.kind).toBe("trusted_difference");
    expect(v3mock.headlineFinding?.text).toContain("예시 통신사 (가상)");
  });

  it("trusted_context: real comparison says same picture; dated 2018 vs claimed 2026", async () => {
    const { c, v2, v3mock } = await judge("trusted_context");
    expect(c.matches[0].comparison!.changedFraction).toBeLessThan(0.02);
    expect(v3mock).toMatchObject({ rule: "v3.trusted_context", strength: "medium" });
    // v2 already showed the same finding; it just could not conclude.
    expect(v2.headlineFinding?.kind).toBe("same");
    expect(v2.headlineFinding?.text).toContain("2018-07-21");
  });
});
