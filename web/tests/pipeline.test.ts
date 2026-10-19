import { beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import sharp from "sharp";
import { getStore } from "../lib/data/store";
import { startCheck } from "../lib/pipeline";
import { toCheckView } from "../lib/view";
import { MOCK_CLAIM } from "../lib/providers/mock/fixtures";
const input = async (name: string) => ({ bytes: await readFile(`public/fixtures/inputs/${name}.png`), mime: "image/png", fileName: name + ".png", inputType: "image" as const, pageUrl: null, publicImageUrl: null, claimedDate: null });
beforeEach(() => { delete (globalThis as { __pairsightStore?: unknown }).__pairsightStore; });
async function done(id: string) {
  for (let i = 0; i < 200; i++) {
    const s = getStore(), check = (await s.getCheck(id))!, analysis = (await s.getAnalysis(check.analysisId))!, view = toCheckView(check, analysis);
    if (["done", "failed"].includes(view.status)) return view;
    await sleep(20);
  }
  throw new Error("pipeline did not finish");
}
describe("persistent projection and per-check workflow", () => {
  it("keeps only a sanitized thumbnail and finishes all six progress steps", async () => {
    const s = getStore(), u = await s.createAnonymousUser();
    const started = await startCheck(u, await input("authentic")); if (!started.ok) throw new Error("start failed");
    const view = await done(started.check.id); expect(view.verdict).toBe("authentic"); expect(Object.values(view.steps).every(s => s === "done")).toBe(true);
    const upload = (await s.readUpload(started.check.id))!;
    expect((await sharp(upload.bytes).metadata()).width).toBe(512); expect(upload.mime).toBe("image/png");
    const recheck = await startCheck(u, { ...await input("authentic"), bytes: upload.bytes, thumbnailOnly: true, forceFresh: true });
    if (!recheck.ok) throw new Error("recheck failed");
    const again = await done(recheck.check.id); expect(again.verdict).toBe("inconclusive"); expect(again.evidence.some(e => e.kind === "c2pa")).toBe(false);
    expect(again.verification?.warnings.some(w => w.includes("썸네일"))).toBe(true);
    await s.deleteUser(u.id);
  });
  it("reuses image analysis without leaking another user's claim evidence", async () => {
    const s = getStore(), a = await s.createAnonymousUser(), b = await s.createAnonymousUser();
    const one = await startCheck(a, { ...await input("miscontextualized"), claimText: MOCK_CLAIM });
    if (!one.ok) throw new Error("start failed");
    expect((await done(one.check.id)).verdict).toBe("miscontextualized");
    const two = await startCheck(b, { ...await input("miscontextualized"), claimText: "부산 시장 행사" });
    if (!two.ok) throw new Error("start failed");
    const view = await done(two.check.id); expect(view.verdict).toBe("inconclusive"); expect(view.analysisId).toBe(one.check.analysisId);
    expect((await s.getAnalysis(view.analysisId))?.evidence.some(e => e.kind === "context" || e.kind === "fact_check")).toBe(false);
    expect((await done(one.check.id)).verdict).toBe("miscontextualized");
    await s.deleteUser(a.id); await s.deleteUser(b.id);
  });
  it("rejects invalid image bytes before charging, and refunds discovery failure", async () => {
    const s = getStore(), u = await s.createAnonymousUser();
    const bad = await startCheck(u, { ...await input("authentic"), bytes: new Uint8Array([1,2,3]) }); expect(bad.ok).toBe(false); expect((await s.usage(u.id)).used).toBe(0);
    const failed = await startCheck(u, await input("provider_timeout")); if (!failed.ok) throw new Error("start failed");
    expect((await done(failed.check.id)).status).toBe("failed"); expect((await s.usage(u.id)).used).toBe(0);
    await s.deleteUser(u.id);
  });
});
