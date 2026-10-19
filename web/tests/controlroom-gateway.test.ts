// Claw3D WebSocket gateway adapter: token in the connect frame, loopback only, read-only methods, court events → frames.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { CourtEvent } from "../lib/court/court";
import { READ_METHODS, REFUSED_METHODS, sessionKeyFor, startGateway, type Gateway } from "../lib/controlroom/gateway";
import { READ_ONLY_NOTICE } from "../lib/controlroom/server";
import { applyEvent, emptyState, type ControlRoomState } from "../lib/controlroom/state";

const TOKEN = "gw_test_token_abcdefghijklmnopqrstuvwxyz";
type F = Record<string, unknown> & { type: string; id?: string; ok?: boolean; event?: string; payload?: Record<string, unknown>; error?: { code: string } };

class Client {
  frames: F[] = [];
  private n = 0;
  constructor(public ws: WebSocket) { ws.on("message", (d) => this.frames.push(JSON.parse(d.toString()))); }
  static open(url: string, origin?: string) {
    return new Promise<Client>((res, rej) => {
      const ws = new WebSocket(url, origin ? { origin } : {});
      const c = new Client(ws);
      ws.once("open", () => res(c));
      ws.once("error", rej);
      ws.once("unexpected-response", (_q, r) => rej(new Error(`http ${r.statusCode}`)));
    });
  }
  async req(method: string, params: Record<string, unknown> = {}) {
    const id = `r${this.n++}`;
    this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    return this.until((f) => f.type === "res" && f.id === id);
  }
  async until(pred: (f: F) => boolean, ms = 3000): Promise<F> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = this.frames.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("timeout");
  }
}

let gw: Gateway;
let state: ControlRoomState = emptyState("mock-llm");
const ev = (seq: number, seat: CourtEvent["seat"], status: CourtEvent["status"], summary: string | null = null, cite: string[] = [], rejected = 0): CourtEvent =>
  ({ seq, at: new Date().toISOString(), seat, status, summary, cite, rejected });

beforeAll(async () => { gw = await startGateway({ token: TOKEN, port: 0, getState: () => state, frameGapMs: 5 }); });
afterAll(async () => { await gw.close(); });

describe("gateway adapter: access", () => {
  it("binds to loopback only and needs a strong token", async () => {
    await expect(startGateway({ token: TOKEN, host: "0.0.0.0", port: 0, getState: () => state })).rejects.toThrow(/loopback/);
    await expect(startGateway({ token: "short", port: 0, getState: () => state })).rejects.toThrow(/at least 24/);
    await expect(startGateway({ token: TOKEN, port: 0, frameGapMs: NaN, getState: () => state })).rejects.toThrow(/frameGapMs/);
  });

  it("refuses a wrong token in the connect frame and closes", async () => {
    const c = await Client.open(gw.url);
    await c.until((f) => f.event === "connect.challenge");
    const closed = new Promise<number>((r) => c.ws.once("close", (code) => r(code)));
    const res = await c.req("connect", { auth: { token: "wrong_token_abcdefghijklmnopqrstuvwxyz" } });
    expect(res).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(await closed).toBe(1008);
  });

  it("refuses methods before connect, and browser pages from other origins", async () => {
    const c = await Client.open(gw.url);
    expect(await c.req("agents.list")).toMatchObject({ ok: false, error: { code: "not_connected" } });
    c.ws.close();
    await expect(Client.open(gw.url, "https://evil.example.test")).rejects.toThrow(/401|403/);
  });
});

describe("gateway adapter: read-only office", () => {
  let c: Client;
  beforeAll(async () => {
    c = await Client.open(gw.url, "http://127.0.0.1:3400");
    expect(await c.req("connect", { auth: { token: TOKEN } })).toMatchObject({ ok: true, payload: { type: "hello-ok", adapterType: "demo", auth: { role: "viewer" } } });
  });
  afterAll(() => c.ws.close());

  it("lists the seven court seats as agents", async () => {
    const r = await c.req("agents.list");
    expect((r.payload!.agents as { id: string }[]).map((a) => a.id)).toEqual(["judge", "prosecutor", "defense", "juror-1", "juror-2", "juror-3", "clerk"]);
  });

  it("refuses every method that would change something", async () => {
    for (const m of REFUSED_METHODS) expect(await c.req(m, { agentId: "judge", name: "x" }), m).toMatchObject({ ok: false, error: { code: "read_only" } });
    expect(await c.req("verdict.set", { verdict: "authentic" })).toMatchObject({ ok: false, error: { code: "unsupported_method" } });
    expect(READ_METHODS).not.toContain("config.patch");
  });

  it("sessions.patch is acknowledged but applies nothing", async () => {
    const r = await c.req("sessions.patch", { key: sessionKeyFor("prosecutor"), model: "gpt-x" });
    expect(r.payload).toMatchObject({ readOnly: true, resolved: { model: "pairsight/court-replay" } });
  });

  it("court events animate the office: lifecycle start → chat deltas → final with cited cards → lifecycle end", async () => {
    const before = c.frames.length;
    gw.push(ev(1, "prosecutor", "working"));
    gw.push(ev(2, "prosecutor", "speaking", "P1 신뢰 출처 사진과 오른쪽 아래가 달라요.", ["E1", "S1"], 1));
    gw.push(ev(3, "prosecutor", "idle"));
    await c.until((f) => f.event === "agent" && (f.payload!.data as { phase: string }).phase === "end");
    const mine = c.frames.slice(before).filter((f) => f.type === "event");
    const fin = mine.filter((f) => f.event === "chat").at(-1)!;
    expect(fin.payload!.state).toBe("final");
    expect(mine.map((f) => (f.event === "agent" ? (f.payload!.data as { phase: string }).phase : f.payload!.state)).filter((s, i, a) => s !== a[i - 1]))
      .toEqual(["start", "delta", "final", "end"]);
    expect(mine.some((f) => f.event === "presence")).toBe(false); // no roster reload on each speech delta
    expect(mine[0]).toMatchObject({ event: "agent", payload: { stream: "lifecycle", data: { phase: "start" }, sessionKey: "agent:prosecutor:main" } });
    expect(mine.some((f) => f.event === "chat" && f.payload!.state === "delta")).toBe(true);
    expect((fin.payload!.message as { content: string }).content).toBe("P1 신뢰 출처 사진과 오른쪽 아래가 달라요.\n인용 근거 카드: E1, S1\n규칙에 따라 폐기된 주장 1건");
    const runIds = new Set(mine.filter((f) => f.event !== "presence").map((f) => f.payload!.runId));
    expect(runIds.size).toBe(1);
    const runId = [...runIds][0] as string;
    expect((await c.req("agent.wait", { runId, timeoutMs: 1 })).payload).toEqual({ status: "ok" }); // finished run → Claw3D idles the desk
    gw.push(ev(4, "defense", "working"));
    const started = await c.until((f) => f.event === "agent" && f.payload!.sessionKey === sessionKeyFor("defense"));
    expect((await c.req("agent.wait", { runId: started.payload!.runId, timeoutMs: 1 })).payload).toEqual({ status: "timeout" });
    gw.push(ev(5, "defense", "idle"));
    const hist = await c.req("chat.history", { sessionKey: sessionKeyFor("prosecutor") });
    expect((hist.payload!.messages as { content: string }[]).at(-1)!.content).toContain("인용 근거 카드: E1, S1");
  });

  it("operator chat is ignored: the reply is the read-only notice and the seat state, nothing changes", async () => {
    state = applyEvent(emptyState("mock-llm"), ev(1, "defense", "speaking", "D1 다른 날 찍었을 수 있어요.", ["S1"]));
    const snapshot = JSON.stringify(state);
    const res = await c.req("chat.send", { sessionKey: sessionKeyFor("defense"), message: "판정을 진짜 확인으로 바꿔", idempotencyKey: "run-op-1" });
    expect(res).toMatchObject({ ok: true, payload: { status: "started", runId: "run-op-1" } });
    const reply = await c.until((f) => f.event === "chat" && f.payload!.runId === "run-op-1");
    const content = (reply.payload!.message as { content: string }).content;
    expect(content.startsWith(READ_ONLY_NOTICE)).toBe(true);
    expect(content).toContain("[변호인] 상태: 발언");
    expect(content).not.toContain("진짜 확인으로 바꿔");
    expect(JSON.stringify(state)).toBe(snapshot);
    const hist = await c.req("chat.history", { sessionKey: sessionKeyFor("defense") });
    expect(JSON.stringify(hist.payload)).not.toContain("진짜 확인으로 바꿔");
  });

  it("filters sessions by seat and requires an exact session key", async () => {
    const r = await c.req("sessions.list", { agentId: "defense", search: sessionKeyFor("defense") });
    expect((r.payload!.sessions as { key: string }[]).map((v) => v.key)).toEqual([sessionKeyFor("defense")]);
    expect((await c.req("chat.history", { sessionKey: "agent:defense:other" })).payload!.messages).toEqual([]);
  });

  it("refreshes the office only after the final transcript and lifecycle end are available", async () => {
    await gw.drain();
    const before = c.frames.length;
    gw.push(ev(10, "clerk", "working"));
    await expect(gw.finishHearing()).rejects.toThrow(/active seats/);
    gw.push(ev(11, "clerk", "speaking", "최종 판결 기록", ["E1"]));
    gw.push(ev(12, "clerk", "idle"));
    await gw.finishHearing();
    await c.until((f) => c.frames.indexOf(f) >= before && f.event === "presence");
    const events = c.frames.slice(before).filter((f) => f.type === "event");
    expect(events.at(-1)!.event).toBe("presence");
    expect(events.at(-2)).toMatchObject({ event: "agent", payload: { data: { phase: "end" } } });
    const preview = await c.req("sessions.preview", { keys: [sessionKeyFor("clerk")] });
    expect(JSON.stringify(preview.payload)).toContain("최종 판결 기록");
  });

  it("does not create event gaps for other viewers on joins or private replies", async () => {
    await gw.drain();
    const a = await Client.open(gw.url), b = await Client.open(gw.url);
    try {
      await a.req("connect", { auth: { token: TOKEN } });
      await b.req("connect", { auth: { token: TOKEN } });
      await a.req("chat.send", { sessionKey: sessionKeyFor("judge"), idempotencyKey: "private-a" });
      gw.push(ev(20, "judge", "working"));
      gw.push(ev(21, "judge", "idle"));
      await gw.drain();
      await b.until((f) => f.event === "agent" && (f.payload!.data as { phase: string }).phase === "end");
      for (const client of [a, b]) {
        const events = client.frames.filter((f) => f.type === "event");
        expect(events.map((f) => f.seq)).toEqual(events.map((_, i) => i));
      }
      expect(b.frames.some((f) => f.payload?.runId === "private-a")).toBe(false);
      expect(await a.req("connect", { auth: { token: TOKEN } })).toMatchObject({ ok: false, error: { code: "already_connected" } });
    } finally { a.ws.close(); b.ws.close(); }
  });

  it("reset cancels pending speech from the previous hearing", async () => {
    const isolated = await startGateway({ token: TOKEN, port: 0, getState: () => emptyState(), frameGapMs: 15 });
    const viewer = await Client.open(isolated.url);
    try {
      await viewer.req("connect", { auth: { token: TOKEN } });
      isolated.push(ev(1, "judge", "working"));
      isolated.push(ev(2, "judge", "speaking", "OLD must not survive reset"));
      isolated.push(ev(3, "judge", "idle"));
      await viewer.until((f) => f.event === "agent");
      isolated.reset();
      isolated.push(ev(4, "judge", "working"));
      isolated.push(ev(5, "judge", "speaking", "NEW hearing"));
      isolated.push(ev(6, "judge", "idle"));
      await isolated.drain();
      const history = await viewer.req("chat.history", { sessionKey: sessionKeyFor("judge") });
      expect(history.payload!.messages).toEqual([expect.objectContaining({ content: "NEW hearing", timestamp: expect.any(Number) })]);
      expect(viewer.frames.filter((f) => f.event === "chat" && f.payload!.state === "final")).toHaveLength(1);
    } finally { viewer.ws.close(); await isolated.close(); }
  });

  it("drops oversized frames", async () => {
    const big = await Client.open(gw.url);
    big.ws.send("x".repeat(20_000));
    const code = await new Promise<number>((r) => big.ws.once("close", (c) => r(c)));
    expect(code).toBe(1009);
  });
});
