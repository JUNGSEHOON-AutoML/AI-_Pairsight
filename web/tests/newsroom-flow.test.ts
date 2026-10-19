import { afterEach, describe, expect, it } from "vitest";
import { CaseRepository } from "../lib/newsroom/repository";
import { runCase, type Workers } from "../lib/newsroom/flow";
import { DEPARTMENTS, type CaseInput, CaseError } from "../lib/newsroom/model";

const stores: CaseRepository[] = [];
const store = () => { const r = new CaseRepository(":memory:"); stores.push(r); return r; };
afterEach(() => stores.splice(0).forEach(r => r.close()));
export const input = (): CaseInput => ({ origin: "manual", claim: "검증 요청", claimedDate: null, pageUrl: "https://example.org/article", imageUrl: null,
  thumbnail: null, imageHash: null, provenance: [], candidateUrls: [], channels: [], topic: null, contentFlags: [], rightsConfirmed: false, reportedBy: "operator-one" });
const workers = (calls: string[] = []): Workers => Object.fromEntries(DEPARTMENTS.map(d => [d.id, { department: d.id, run: async () => {
  calls.push(d.id); return { data: { result: d.id }, waitForApproval: d.id === "trust_safety" };
} }])) as unknown as Workers;

describe("single case through nine departments", () => {
  it("accumulates sections in order, stops for a human, then resumes without repeating earlier work", async () => {
    const r = store(), calls: string[] = [], c = r.create(input());
    const waiting = await runCase(r, c.id, workers(calls));
    expect(waiting.status).toBe("awaiting_approval");
    expect(calls).toEqual(DEPARTMENTS.slice(0, 7).map(d => d.id));
    expect(Object.keys(waiting.sections)).toHaveLength(7);
    await runCase(r, c.id, workers(calls));
    expect(calls).toHaveLength(7);
    // Approval is a separate authenticated action; this test simulates its persisted result.
    r.mutate(c.id, x => { x.sections.trust_safety!.state = "done"; x.status = "ready";
      x.approvals.push({ operatorId: "reviewer", at: new Date().toISOString(), title: "확인한 사실", summary: "근거 요약" }); });
    const complete = await runCase(r, c.id, workers(calls));
    expect(complete.status).toBe("complete");
    expect(calls).toEqual(DEPARTMENTS.map(d => d.id));
    expect(r.events().filter(e => e.state === "running").map(e => e.department)).toEqual(calls);
  });
  it("stops at a failed worker, records failure, and retries exactly that department", async () => {
    const r = store(), calls: string[] = [], c = r.create(input()), w = workers(calls);
    w.osint.run = async () => { calls.push("osint"); throw Error("API key and raw remote response MUST NOT PERSIST"); };
    const failed = await runCase(r, c.id, w);
    expect(failed.stage).toBe("osint"); expect(failed.status).toBe("failed");
    expect(failed.sections.ai_data).toBeUndefined();
    expect(JSON.stringify([failed, r.events()])).not.toContain("API key");
    expect(r.events().some(e => e.department === "reliability" && e.state === "warning")).toBe(true);
    await runCase(r, c.id, workers(calls));
    expect(calls.filter(x => x === "monitoring")).toHaveLength(1);
    expect(r.get(c.id)!.sections.osint!.attempt).toBe(2);
  });
  it("cannot bypass approval or alter another section through a worker's input copy", async () => {
    const r = store(), c = r.create(input()), w = workers();
    w.monitoring.run = async snapshot => { (snapshot as { status: string }).status = "complete"; return { data: {}, waitForApproval: true }; };
    const failed = await runCase(r, c.id, w);
    expect(failed.status).toBe("failed");
    expect(failed.sections.monitoring!.error!.code).toBe("worker_contract");
    expect(failed.approvals).toEqual([]);
  });
  it("prevents concurrent execution and times out without committing a late result", async () => {
    const r = store(), c = r.create(input()), w = workers();
    let release!: (v: { data: Record<string, unknown> }) => void;
    w.monitoring.run = () => new Promise(resolve => { release = resolve; });
    const running = runCase(r, c.id, w, { timeoutMs: 30 });
    await expect(runCase(r, c.id, w)).rejects.toMatchObject({ code: "busy" });
    const failed = await running;
    expect(failed.status).toBe("failed");
    expect(failed.sections.monitoring!.error!.code).toBe("worker_timeout");
    release({ data: { maliciousLate: true } });
    await Promise.resolve();
    expect(r.get(c.id)!.sections.monitoring!.data).toEqual({});
  });
  it("records an interrupted lease without silently advancing", async () => {
    const r = store(), c = r.create(input());
    r.mutate(c.id, x => { x.run = { token: "dead", expiresAt: 0 }; });
    expect((await runCase(r, c.id, workers())).status).toBe("failed");
    expect(r.events().at(-1)!.state).toBe("failed");
  });
  it("keeps fixtures out of the live store view and runner", async () => {
    const r = store(), c = r.create({ ...input(), origin: "fixture" });
    expect(r.list()).toEqual([]);
    await expect(runCase(r, c.id, workers())).rejects.toBeInstanceOf(CaseError);
  });
});
