import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStore, utcDay, type DataStore } from "../lib/data/store";
import { SCENARIO_DATA } from "../lib/providers/mock/fixtures";
import { toCheckView } from "../lib/view";

// Fresh memory store per test (getStore caches it on globalThis).
beforeEach(() => {
  delete (globalThis as { __pairsightStore?: unknown }).__pairsightStore;
});
afterEach(() => vi.useRealTimers());

const signIn = async (store: DataStore, userId: string, email: string) => {
  const user = await store.completeLogin(await store.createLoginToken(userId, email));
  if (!user) throw new Error("test login failed");
  return user;
};

const addCheck = async (store: DataStore, userId: string, analysisId: string) => store.createCheck({
  userId, analysisId, inputType: "image", pageUrl: null, fileName: "example.png",
  claimedDate: null, charged: true, quotaDay: utcDay(),
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
    const linked = await signIn(s, u.id, "a@example.com");
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
    expect(await s.completeLogin(t)).toMatchObject({ id: u.id, email: "x@example.com" });
    expect(await s.completeLogin(t)).toBeNull();
  });

  it("rejects a token at the expiration boundary", async () => {
    vi.useFakeTimers();
    const s = getStore();
    const u = await s.createAnonymousUser();
    const token = await s.createLoginToken(u.id, "expired@example.com");
    vi.advanceTimersByTime(15 * 60_000);
    expect(await s.completeLogin(token)).toBeNull();
    expect((await s.getUser(u.id))?.email).toBeNull();
  });

  it("rejects pending tokens after deletion, even when their email is an existing account", async () => {
    const s = getStore();
    const account = await signIn(s, (await s.createAnonymousUser()).id, "existing@example.com");
    const anonymous = await s.createAnonymousUser();
    const token = await s.createLoginToken(anonymous.id, account.email!);
    await s.deleteUser(anonymous.id);
    expect(await s.completeLogin(token)).toBeNull();
    expect(await s.getUser(account.id)).toEqual(account);
  });

  it("invalidates older pending links when an identity is linked", async () => {
    const s = getStore();
    const u = await s.createAnonymousUser();
    const old = await s.createLoginToken(u.id, "old@example.com");
    await signIn(s, u.id, "new@example.com");
    expect(await s.completeLogin(old)).toBeNull();
    expect((await s.getUser(u.id))?.email).toBe("new@example.com");
  });
});

describe("existing-account sign-in", () => {
  it("moves anonymous checks and uploads, adds usage, and retires the anonymous identity", async () => {
    const s = getStore();
    const account = await signIn(s, (await s.createAnonymousUser()).id, "owner@example.com");
    const anonymous = await s.createAnonymousUser();
    const other = await s.createAnonymousUser();
    const analysis = await s.createAnalysis("shared", 1);
    const existing = await addCheck(s, account.id, analysis.id);
    const moved = await addCheck(s, anonymous.id, analysis.id);
    const untouched = await addCheck(s, other.id, analysis.id);
    const bytes = new Uint8Array([1, 2, 3]);
    await s.saveUpload(moved.id, bytes, "image/png");
    await s.takeQuota(account.id);
    await s.takeQuota(anonymous.id);
    await s.takeQuota(anonymous.id);
    const stale = await s.createLoginToken(anonymous.id, "different@example.com");

    expect((await signIn(s, anonymous.id, account.email!)).id).toBe(account.id);
    expect((await s.listChecks(account.id)).map((c) => c.id).sort()).toEqual([existing.id, moved.id].sort());
    expect(await s.getCheck(moved.id)).toEqual({ ...moved, userId: account.id });
    expect((await s.readUpload(moved.id))?.bytes).toEqual(bytes);
    expect((await s.usage(account.id)).used).toBe(3);
    expect(await s.getUser(anonymous.id)).toBeNull();
    expect(await s.listChecks(anonymous.id)).toEqual([]);
    expect((await s.usage(anonymous.id)).used).toBe(0);
    expect(await s.completeLogin(stale)).toBeNull();
    expect(await s.getCheck(untouched.id)).toEqual(untouched);
    expect(await s.getAnalysis(analysis.id)).toEqual(analysis);

    // An in-flight analysis that fails after sign-in refunds the new owner on the original day.
    const [check] = (await s.listChecksForAnalysis(analysis.id)).filter((c) => c.id === moved.id);
    await s.refundQuota(check.userId, check.quotaDay);
    expect((await s.usage(account.id)).used).toBe(2);
    await s.deleteUser(account.id);
    expect(await s.readUpload(moved.id)).toBeNull();
    expect(await s.getCheck(untouched.id)).toEqual(untouched);
  });

  it("preserves usage on previous UTC days for late refunds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const s = getStore();
    const account = await signIn(s, (await s.createAnonymousUser()).id, "owner@example.com");
    const anonymous = await s.createAnonymousUser();
    await s.takeQuota(account.id);
    await s.takeQuota(anonymous.id);
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    await s.takeQuota(anonymous.id);
    await signIn(s, anonymous.id, account.email!);
    expect((await s.usage(account.id)).used).toBe(1);
    await s.refundQuota(account.id, "2026-10-18");
    expect((await s.usage(account.id)).used).toBe(1);
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    expect((await s.usage(account.id)).used).toBe(1);
  });

  it("does not reset or clamp usage when the merged total exceeds the account's daily limit", async () => {
    const s = getStore();
    const account = await signIn(s, (await s.createAnonymousUser()).id, "owner@example.com");
    const anonymous = await s.createAnonymousUser();
    for (let i = 0; i < account.dailyLimit; i++) await s.takeQuota(account.id);
    await s.takeQuota(anonymous.id);
    await signIn(s, anonymous.id, account.email!);
    expect(await s.takeQuota(account.id)).toMatchObject({ ok: false, used: account.dailyLimit + 1 });
  });

  it("does not move one registered account's data into another", async () => {
    const s = getStore();
    const a = await signIn(s, (await s.createAnonymousUser()).id, "a@example.com");
    const b = await signIn(s, (await s.createAnonymousUser()).id, "b@example.com");
    const analysis = await s.createAnalysis("private", 1);
    const check = await addCheck(s, a.id, analysis.id);
    expect((await signIn(s, a.id, b.email!)).id).toBe(b.id);
    expect(await s.getUser(a.id)).toEqual(a);
    expect(await s.getCheck(check.id)).toEqual(check);
    expect(await s.listChecks(b.id)).toEqual([]);
  });

  it("creates a separate account when a registered user signs in with a new email", async () => {
    const s = getStore();
    const a = await signIn(s, (await s.createAnonymousUser()).id, "a@example.com");
    const b = await signIn(s, a.id, "b@example.com");
    expect(b.id).not.toBe(a.id);
    expect(await s.getUser(a.id)).toEqual(a);
  });

  it("merges only once when the same link is consumed concurrently", async () => {
    const s = getStore();
    const account = await signIn(s, (await s.createAnonymousUser()).id, "owner@example.com");
    const anonymous = await s.createAnonymousUser();
    await s.takeQuota(anonymous.id);
    const token = await s.createLoginToken(anonymous.id, account.email!);
    const results = await Promise.all([s.completeLogin(token), s.completeLogin(token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await s.usage(account.id)).used).toBe(1);
  });
});

describe("shared analyses and per-check context", () => {
  it("chooses the latest usable run even when timestamps are identical", async () => {
    vi.useFakeTimers();
    const s = getStore();
    const first = await s.createAnalysis("hash", 1);
    const second = await s.createAnalysis("hash", 1);
    const third = await s.createAnalysis("hash", 1);
    expect([first.runNumber, second.runNumber, third.runNumber]).toEqual([1, 2, 3]);
    expect(second.startedAt).toBe(first.startedAt);
    expect((await s.findReusableAnalysis("hash", 1))?.id).toBe(third.id);
    await s.updateAnalysis(third.id, { status: "failed" });
    expect((await s.findReusableAnalysis("hash", 1))?.id).toBe(second.id);
    expect((await s.createAnalysis("hash", 2)).runNumber).toBe(1);
    expect((await s.createAnalysis("other-hash", 1)).runNumber).toBe(1);
  });

  it("computes different verdicts for different claimed dates without changing the shared evidence", async () => {
    const s = getStore();
    const u = await s.createAnonymousUser();
    const analysis = await s.createAnalysis("hash", 1);
    const done = await s.updateAnalysis(analysis.id, {
      status: "done", evidence: SCENARIO_DATA.authentic.evidence, matches: SCENARIO_DATA.authentic.matches,
    });
    const check = await addCheck(s, u.id, done.id);
    const later = await s.createCheck({ ...check, claimedDate: "2026-10-01" });
    expect(toCheckView(check, done).verdict).toBe("authentic");
    expect(toCheckView(later, done).verdict).toBe("inconclusive"); // page age does not establish image age
    expect(toCheckView(check, done).verdict).toBe("authentic");
    expect(await s.getAnalysis(done.id)).toEqual(done);
    expect(toCheckView(check, { ...done, status: "running" }).verdict).toBeNull();
    expect(toCheckView(check, { ...done, status: "running" }).steps.context).toBe("waiting");
  });
});
