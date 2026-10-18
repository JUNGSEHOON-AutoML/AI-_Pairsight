import { beforeEach, describe, expect, it } from "vitest";
import { getStore, utcDay } from "../lib/data/store";

// Fresh memory store per test (getStore caches it on globalThis).
beforeEach(() => {
  delete (globalThis as { __pairsightStore?: unknown }).__pairsightStore;
});

describe("quota (mirrors take_quota/refund_quota in schema.sql)", () => {
  it("allows exactly the daily limit, then refuses", async () => {
    const s = getStore();
    const u = await s.createAnonymousUser(); // limit 3 by default
    const got = [];
    for (let i = 0; i < 4; i++) got.push((await s.takeQuota(u.id)).ok);
    expect(got).toEqual([true, true, true, false]);
  });

  it("refund gives one back and never goes below zero", async () => {
    const s = getStore();
    const u = await s.createAnonymousUser();
    await s.takeQuota(u.id);
    await s.refundQuota(u.id, utcDay());
    await s.refundQuota(u.id, utcDay());
    expect((await s.usage(u.id)).used).toBe(0);
  });

  it("signing in keeps the same user id and raises the limit", async () => {
    const s = getStore();
    const u = await s.createAnonymousUser();
    const linked = await s.linkEmail(u.id, "a@example.com");
    expect(linked.id).toBe(u.id);
    expect(linked.dailyLimit).toBeGreaterThan(u.dailyLimit);
    expect((await s.findUserByEmail("a@example.com"))?.id).toBe(u.id);
  });
});

describe("account deletion (cascade like schema.sql)", () => {
  it("removes the user's checks, uploads and usage; keeps the shared analysis and other users' checks", async () => {
    const s = getStore();
    const a = await s.createAnonymousUser();
    const b = await s.createAnonymousUser();
    const analysis = await s.createAnalysis("hash-1", 1);
    const base = { analysisId: analysis.id, inputType: "image" as const, pageUrl: null, fileName: null, claimedDate: null, charged: true, quotaDay: utcDay() };
    const ca = await s.createCheck({ ...base, userId: a.id });
    const cb = await s.createCheck({ ...base, userId: b.id });
    await s.saveUpload(ca.id, new Uint8Array([1, 2, 3]), "image/png");
    await s.takeQuota(a.id);

    await s.deleteUser(a.id);

    expect(await s.getUser(a.id)).toBeNull();
    expect(await s.getCheck(ca.id)).toBeNull();
    expect(await s.readUpload(ca.id)).toBeNull();
    expect((await s.usage(a.id)).used).toBe(0);
    expect(await s.getCheck(cb.id)).not.toBeNull();
    expect(await s.getAnalysis(analysis.id)).not.toBeNull();
  });
});

describe("login tokens", () => {
  it("are single use", async () => {
    const s = getStore();
    const u = await s.createAnonymousUser();
    const t = await s.createLoginToken(u.id, "x@example.com");
    expect(await s.consumeLoginToken(t)).toEqual({ userId: u.id, email: "x@example.com" });
    expect(await s.consumeLoginToken(t)).toBeNull();
  });
});
