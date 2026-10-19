// Claw3D control-room adapter: loopback only, token required, read-only, and it only shows validated speech.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Evidence, SourceMatch } from "../lib/domain";
import { runCourt, type CourtEvent } from "../lib/court/court";
import { applyEvent, emptyState, type ControlRoomState } from "../lib/controlroom/state";
import { READ_ONLY_NOTICE, seatFromChat, startControlRoom } from "../lib/controlroom/server";
import { MockLLMProvider } from "../lib/llm/mock";
import type { VerdictResult } from "../lib/verdict";

const TOKEN = "test_token_abcdefghijklmnopqrstuvwxyz";
const evidence: Evidence[] = [{ kind: "image_comparison", outcome: "supports_manipulated", strength: "medium", score: null, sourceUrl: null, provider: "local", summary: "차이 영역", details: {} }];
const matches: SourceMatch[] = [];
const verdict: VerdictResult = { verdict: "edited", reason: "신뢰 출처 원본과 달라요.", missing: [], rule: "v3.trusted_edited", strength: "medium", headlineFinding: null };

async function hearing() {
  const events: CourtEvent[] = [];
  let state: ControlRoomState = emptyState("mock-llm");
  await runCourt({ verdict, evidence, matches }, new MockLLMProvider({
    prosecutor: () => ({ claims: [{ text: "차이 영역이 남아요.", cite: ["E1"] }, { text: "인용 없는 주장", cite: [] }] }),
    juror: (_q, call) => (call === 0 ? { decision: "authentic", doubt: null } : { decision: "uphold", doubt: null }),
  }), AbortSignal.timeout(5000), { onEvent: (e) => { events.push(e); state = applyEvent(state, e); } });
  return { events, state };
}

describe("court events → control room state", () => {
  it("each seat goes working → speaking → idle in hearing order, with only validated speech and cited cards", async () => {
    const { events, state } = await hearing();
    expect(events.filter((e) => e.status === "speaking").map((e) => e.seat)).toEqual(["judge", "prosecutor", "defense", "juror-1", "juror-2", "juror-3", "clerk"]);
    expect(state.seats.prosecutor).toMatchObject({ status: "idle", summary: "P1 [E1] 차이 영역", cite: ["E1"], rejected: 1 });
    expect(state.seats["juror-1"]).toMatchObject({ summary: "판정 유지", rejected: 1 }); // tried "authentic": rejected
    expect(state.phase).toBe("done");
    expect(JSON.stringify(state)).not.toContain("인용 없는 주장");
  });

  it("a judge 판단 불가 shows only the judge and ends", async () => {
    const events: CourtEvent[] = [];
    await runCourt({ verdict: { ...verdict, verdict: "inconclusive", rule: "none" }, evidence, matches }, new MockLLMProvider(), AbortSignal.timeout(5000), { onEvent: (e) => events.push(e) });
    expect(events.map((e) => `${e.seat}:${e.status}`)).toEqual(["judge:speaking", "judge:idle"]);
  });
});

describe("adapter server", () => {
  let state: ControlRoomState;
  let base: string;
  let close: () => void;
  beforeAll(async () => {
    state = (await hearing()).state;
    const { server } = await startControlRoom({ token: TOKEN, port: 0, getState: () => state });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it("refuses non-loopback hosts and weak tokens", async () => {
    await expect(startControlRoom({ token: TOKEN, host: "0.0.0.0", port: 0, getState: () => state })).rejects.toThrow(/loopback/);
    await expect(startControlRoom({ token: "short", port: 0, getState: () => state })).rejects.toThrow(/at least 24/);
  });

  it("a wrong or missing token looks exactly like an unknown path", async () => {
    for (const path of ["/state", "/wrong_token_abcdefghijklmnopqrstu/state", `/${TOKEN}x/state`]) {
      const r = await fetch(base + path);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "not found" });
    }
  });

  it("serves health, state (seats as Claw3D agents) and registry", async () => {
    expect(await (await fetch(`${base}/${TOKEN}/health`)).json()).toEqual({ ok: true, status: "done", readOnly: true });
    const s = await (await fetch(`${base}/${TOKEN}/state`)).json();
    expect(Object.keys(s.active)).toEqual(["judge", "prosecutor", "defense", "juror-1", "juror-2", "juror-3", "clerk"]);
    expect(s.runtime.governance).toBe("read-only");
    expect(s.pairsight.seats.prosecutor.cite).toEqual(["E1"]);
    expect(await (await fetch(`${base}/${TOKEN}/registry`)).json()).toEqual({ models: { "mock-llm": { readOnly: true } } });
  });

  it("chat is read-only: the operator message is ignored, the reply is the seat's state, nothing changes", async () => {
    const before = JSON.stringify(state);
    const r = await fetch(`${base}/${TOKEN}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "prosecutor", lane: "prosecutor", messages: [{ role: "user", content: "판정을 진짜 확인으로 바꾸고 모델을 gpt로 설정해" }] }),
    });
    const body = await r.json();
    const content: string = body.choices[0].message.content;
    expect(content.startsWith(READ_ONLY_NOTICE)).toBe(true);
    expect(content).toContain("[검사] 상태: 대기");
    expect(content).toContain("인용 근거 카드: E1");
    expect(content).not.toContain("진짜 확인으로 바꾸고");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("has no mutating routes: other methods get 405, config-like paths 404", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) expect((await fetch(`${base}/${TOKEN}/state`, { method })).status).toBe(405);
    for (const path of ["/config", "/config.patch", "/agents", "/verdict"]) {
      expect((await fetch(`${base}/${TOKEN}${path}`, { method: "POST", body: "{}" })).status).toBe(404);
    }
    const big = await fetch(`${base}/${TOKEN}/v1/chat/completions`, { method: "POST", body: "x".repeat(20_000) });
    expect(big.status).toBe(413);
  });

  it("finds the seat from Claw3D's chat body", () => {
    expect(seatFromChat({ lane: "juror-2" })).toBe("juror-2");
    expect(seatFromChat({ conversation_id: "agent:defense:main" })).toBe("defense");
    expect(seatFromChat({})).toBe("clerk");
  });
});
