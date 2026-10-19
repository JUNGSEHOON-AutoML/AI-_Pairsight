// Read-only Claw3D gateway adapter (WebSocket), following the protocol of Claw3D's own demo gateway
// (server/demo-gateway-adapter.js, main 0565b78). Unlike the custom HTTP seam, this protocol carries events,
// so the 3D office can animate who is working and show what each seat said.
//   court "working"  → event agent {stream: "lifecycle", data: {phase: "start"}}   (desk turns busy)
//   court "speaking" → event chat delta…final (validated summary + cited cards)
//   court "idle"     → event agent lifecycle "end"
// Rules: loopback only; token from PAIRSIGHT_CONTROLROOM_TOKEN checked in the connect frame (Claw3D's Studio
// proxy injects CLAW3D_GATEWAY_TOKEN as params.auth.token); browser Origins other than loopback are refused;
// every method that would change something answers "read_only"; operator chat never reaches an agent.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { CourtEvent, Seat } from "../court/court";
import { checkToken, READ_ONLY_NOTICE } from "./server";
import { describeSeat, SEATS, type ControlRoomState } from "./state";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const MAIN_KEY = "main";
export const sessionKeyFor = (seat: Seat) => `agent:${seat}:${MAIN_KEY}`;
const seatFromKey = (key: unknown): Seat | null => {
  const id = typeof key === "string" ? key.split(":")[1] : "";
  return SEATS.some((s) => sessionKeyFor(s.id) === key) ? (id as Seat) : null;
};

/** Methods Claw3D may call that only read. Anything that would change agents, files, config, approvals,
 * cron or sessions is refused, as is any method not listed. */
export const READ_METHODS = [
  "agents.list", "sessions.list", "sessions.preview", "sessions.patch", "chat.send", "chat.history", "agent.wait",
  "tasks.list", "status", "config.get", "agents.files.get", "exec.approvals.get", "wake", "skills.status", "models.list", "cron.list",
] as const;
export const REFUSED_METHODS = [
  "agents.create", "agents.update", "agents.delete", "agents.files.set", "config.set", "config.patch",
  "exec.approvals.set", "exec.approval.resolve", "cron.add", "cron.run", "cron.remove", "sessions.reset", "chat.abort",
] as const;

type Frame = { type: "req"; id: string; method: string; params?: Record<string, unknown> };
type Line = { role: "user" | "assistant"; content: string; at: number };

export interface GatewayOptions {
  token: string;
  host?: string;
  port?: number; // default PAIRSIGHT_CONTROLROOM_WS_PORT or 3411 (Pairsight 3000, Claw3D 3400, HTTP adapter 3410)
  getState: () => ControlRoomState;
  model?: string;
  frameGapMs?: number; // spacing between frames of one seat (default 150; tests use 0)
}

const sameToken = (a: unknown, b: string) => {
  if (typeof a !== "string") return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function originAllowed(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (Claw3D's Studio proxy sets a loopback origin anyway)
  try { return LOOPBACK.has(new URL(origin).hostname.replace(/^\[|\]$/g, "")); } catch { return false; }
}

export interface Gateway {
  server: Server;
  port: number;
  url: string;
  /** Feed one court event; it becomes office frames for every connected viewer. */
  push(e: CourtEvent): void;
  /** Start over (a new hearing): seat transcripts are cleared. */
  reset(): void;
  /** Resolve after all queued speech and lifecycle frames have been sent. */
  drain(): Promise<void>;
  /** Refresh the office from the completed transcript, only after all frames are delivered. */
  finishHearing(): Promise<void>;
  close(): Promise<void>;
}

export function startGateway(opts: GatewayOptions): Promise<Gateway> {
  const host = opts.host ?? "127.0.0.1";
  if (!LOOPBACK.has(host)) return Promise.reject(new Error(`control room binds to loopback only, got ${host}`));
  if (opts.frameGapMs !== undefined && (!Number.isFinite(opts.frameGapMs) || opts.frameGapMs < 0 || opts.frameGapMs > 60_000)) {
    return Promise.reject(new Error("frameGapMs must be between 0 and 60000."));
  }
  try { checkToken(opts.token); } catch (e) { return Promise.reject(e); }
  const model = opts.model ?? "pairsight/court-replay";
  const history = new Map<Seat, Line[]>();
  const runs = new Map<Seat, string>();
  // Runs whose lifecycle end has not been sent yet. Claw3D reconciles busy desks by calling agent.wait and only
  // accepts "ok"/"error" as finished (fleetLifecycleWorkflow.resolveReconcileWaitOutcome).
  const openRuns = new Set<string>();
  const viewers = new Set<(frame: Record<string, unknown>) => void>();
  let generation = 0;
  let closed = false;
  const broadcast = (frame: Record<string, unknown>) => {
    for (const send of viewers) send(frame);
  };
  const lines = (seat: Seat) => history.get(seat) ?? (history.set(seat, []), history.get(seat)!);
  const presence = () => ({ type: "event", event: "presence", payload: { sessions: {
    recent: SEATS.map((s) => ({ key: sessionKeyFor(s.id), updatedAt: lines(s.id).at(-1)?.at ?? null })),
    byAgent: SEATS.map((s) => ({ agentId: s.id, recent: [{ key: sessionKeyFor(s.id), updatedAt: lines(s.id).at(-1)?.at ?? null }] })),
  } } });

  const lifecycle = (seat: Seat, phase: "start" | "end", runId: string) => {
    if (phase === "start") openRuns.add(runId); else openRuns.delete(runId);
    broadcastLifecycle(seat, phase, runId);
  };
  const broadcastLifecycle = (seat: Seat, phase: "start" | "end", runId: string) => broadcast({
    type: "event", event: "agent", payload: { runId, sessionKey: sessionKeyFor(seat), stream: "lifecycle", data: { phase } },
  });
  const chat = (seat: Seat, runId: string, state: "delta" | "final", content: string) => broadcast({
    type: "event", event: "chat",
    payload: { runId, sessionKey: sessionKeyFor(seat), state, ...(state === "final" ? { stopReason: "end_turn" } : {}), message: { role: "assistant", content } },
  });
  // Serialize each seat's speech. Timing is for readability, not a protocol correctness guarantee.
  const queues = new Map<Seat, Promise<void>>();
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const enqueue = (seat: Seat, job: (current: () => boolean) => Promise<void>) => {
    const epoch = generation;
    const current = () => !closed && epoch === generation;
    const next = (queues.get(seat) ?? Promise.resolve()).then(async () => {
      if (current()) await job(current);
    });
    queues.set(seat, next);
    return next;
  };
  const say = (seat: Seat, runId: string, text: string) => enqueue(seat, async (current) => {
    const gap = opts.frameGapMs ?? 150;
    const words = text.split(" ");
    const step = Math.max(1, Math.ceil(words.length / 6));
    for (let i = step; i < words.length; i += step) { if (!current()) return; chat(seat, runId, "delta", words.slice(0, i).join(" ")); await wait(gap); }
    if (!current()) return;
    chat(seat, runId, "delta", text);
    await wait(gap);
    if (!current()) return;
    lines(seat).push({ role: "assistant", content: text, at: Date.now() });
    if (lines(seat).length > 100) lines(seat).shift();
    chat(seat, runId, "final", text);
    await wait(gap);
  });
  const speech = (e: CourtEvent) => [
    e.summary ?? "",
    e.cite.length ? `인용 근거 카드: ${e.cite.join(", ")}` : "",
    e.rejected ? `규칙에 따라 폐기된 주장 ${e.rejected}건` : "",
  ].filter(Boolean).join("\n");

  function push(e: CourtEvent) {
    if (closed) return;
    const gap = opts.frameGapMs ?? 150;
    if (e.status === "working") {
      const runId = randomUUID();
      runs.set(e.seat, runId);
      void enqueue(e.seat, async () => { lifecycle(e.seat, "start", runId); await wait(gap); });
    } else if (e.status === "speaking") {
      let runId = runs.get(e.seat);
      if (!runId) {
        const fresh = randomUUID();
        runId = fresh;
        runs.set(e.seat, fresh);
        void enqueue(e.seat, async () => { lifecycle(e.seat, "start", fresh); await wait(gap); });
      }
      void say(e.seat, runId, speech(e));
    } else {
      const runId = runs.get(e.seat);
      runs.delete(e.seat);
      if (runId) void enqueue(e.seat, async (current) => { await wait(gap * 2); if (current()) lifecycle(e.seat, "end", runId); });
    }
  }

  const agentsPayload = () => SEATS.map((s) => ({ id: s.id, name: s.name, role: s.role, workspace: `/pairsight/court/${s.id}`, identity: { name: s.name, emoji: "⚖️" } }));

  function handle(frame: Frame, send: (f: Record<string, unknown>) => void): Record<string, unknown> {
    const ok = (payload: unknown = {}) => ({ type: "res", id: frame.id, ok: true, payload });
    const err = (code: string, message: string) => ({ type: "res", id: frame.id, ok: false, error: { code, message } });
    const p = frame.params ?? {};
    if ((REFUSED_METHODS as readonly string[]).includes(frame.method)) return err("read_only", `${READ_ONLY_NOTICE} (${frame.method})`);
    if (!(READ_METHODS as readonly string[]).includes(frame.method)) return err("unsupported_method", `${frame.method} is not available in the read-only control room.`);
    switch (frame.method) {
      case "agents.list": return ok({ defaultId: "judge", mainKey: MAIN_KEY, agents: agentsPayload() });
      case "sessions.list": return ok({ sessions: SEATS.filter((s) => (!p.agentId || s.id === p.agentId) && (!p.search || sessionKeyFor(s.id).includes(String(p.search)))).map((s) => ({ key: sessionKeyFor(s.id), agentId: s.id, updatedAt: lines(s.id).at(-1)?.at ?? null, displayName: "법정", origin: { label: s.name, provider: "pairsight" }, model, modelProvider: "pairsight" })) });
      case "sessions.preview": {
        const keys = Array.isArray(p.keys) ? p.keys : [];
        return ok({ ts: Date.now(), previews: keys.map((key) => {
          const seat = seatFromKey(key);
          const items = seat ? lines(seat).slice(-8).map((l) => ({ role: l.role, text: l.content.slice(0, 240), timestamp: l.at })) : [];
          return { key, status: items.length ? "ok" : "empty", items };
        }) });
      }
      // Claw3D sets model/thinking before chatting. Acknowledged, never applied: nothing here is configurable.
      case "sessions.patch": return ok({ ok: true, key: p.key, readOnly: true, entry: {}, resolved: { model, modelProvider: "pairsight" } });
      case "chat.history": {
        const seat = seatFromKey(p.sessionKey);
        return ok({ sessionKey: p.sessionKey, messages: seat ? lines(seat).map((l) => ({ role: l.role, content: l.content, timestamp: l.at })) : [] });
      }
      case "chat.send": {
        // The operator's text is never forwarded or stored; the reply is the seat's current state.
        const seat = seatFromKey(p.sessionKey) ?? "clerk";
        const runId = typeof p.idempotencyKey === "string" && p.idempotencyKey ? p.idempotencyKey : randomUUID();
        setImmediate(() => {
          const content = `${READ_ONLY_NOTICE}\n\n${describeSeat(opts.getState(), seat)}`;
          send({ type: "event", event: "chat", payload: { runId, sessionKey: sessionKeyFor(seat), state: "final", stopReason: "end_turn", message: { role: "assistant", content } } });
        });
        return ok({ status: "started", runId });
      }
      case "agent.wait": return ok({ status: typeof p.runId === "string" && openRuns.has(p.runId) ? "timeout" : "ok" });
      case "status": return ok({ sessions: { recent: SEATS.flatMap((s) => (lines(s.id).length ? [{ key: sessionKeyFor(s.id), updatedAt: lines(s.id).at(-1)!.at }] : [])), byAgent: SEATS.map((s) => ({ agentId: s.id, recent: lines(s.id).length ? [{ key: sessionKeyFor(s.id), updatedAt: lines(s.id).at(-1)!.at }] : [] })) } });
      case "config.get": return ok({ config: { gateway: { reload: { mode: "off" } }, pairsight: { readOnly: true } }, hash: "pairsight-read-only", exists: true, path: "(read-only)" });
      case "agents.files.get": return ok({ file: { missing: true } });
      case "exec.approvals.get": return ok({ path: "", exists: true, hash: "pairsight-read-only", file: { version: 1, defaults: { security: "deny", ask: "always", autoAllowSkills: false }, agents: {} } });
      case "models.list": return ok({ models: [{ id: model, name: "Pairsight 법정 재생 (보기 전용)", provider: "pairsight" }] });
      case "skills.status": return ok({ skills: [] });
      case "cron.list": return ok({ jobs: [] });
      case "tasks.list": return ok({ tasks: [] });
      default: return ok({ ok: true }); // wake
    }
  }

  const server = createServer((_req, res) => { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found\n"); });
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024, verifyClient: ({ req }: { req: IncomingMessage }) => originAllowed(req) });
  wss.on("connection", (ws: WebSocket) => {
    let connected = false;
    // Sequence numbers belong to a connection. A private chat or another viewer joining must not create
    // gaps for existing viewers (Claw3D interprets gaps as lost events and reloads the entire roster).
    let sequence = 0;
    const send = (f: Record<string, unknown>) => {
      if (ws.readyState !== ws.OPEN) return;
      const payload = f.payload as Record<string, unknown> | undefined;
      if (f.type === "event") {
        const n = sequence++;
        ws.send(JSON.stringify({ ...f, seq: n, ...(payload ? { payload: { ...payload, seq: n } } : {}) }));
      } else ws.send(JSON.stringify(f));
    };
    send({ type: "event", event: "connect.challenge", payload: { nonce: randomUUID() } });
    const timer = setTimeout(() => { if (!connected) ws.close(1008, "connect timeout"); }, 10_000);
    ws.on("message", (raw) => {
      let frame: Frame;
      try { frame = JSON.parse(raw.toString()); } catch { return; }
      if (!frame || frame.type !== "req" || typeof frame.id !== "string" || typeof frame.method !== "string") return;
      if (frame.method === "connect") {
        if (connected) { send({ type: "res", id: frame.id, ok: false, error: { code: "already_connected", message: "Already connected." } }); return; }
        const auth = (frame.params?.auth ?? {}) as { token?: unknown };
        if (!sameToken(auth.token, opts.token)) {
          send({ type: "res", id: frame.id, ok: false, error: { code: "unauthorized", message: "invalid token" } });
          ws.close(1008, "unauthorized");
          return;
        }
        connected = true;
        clearTimeout(timer);
        viewers.add(send);
        // Bootstrap and completed-hearing refreshes only; never reload the roster for each speech delta.
        setTimeout(() => send(presence()), 500);
        send({
          type: "res", id: frame.id, ok: true,
          payload: {
            type: "hello-ok", protocol: 3, adapterType: "demo",
            features: { methods: [...READ_METHODS], events: ["chat", "agent", "presence", "heartbeat"] },
            snapshot: { health: { agents: SEATS.map((s) => ({ agentId: s.id, name: s.name, isDefault: s.id === "judge" })), defaultAgentId: "judge" }, sessionDefaults: { mainKey: MAIN_KEY } },
            auth: { role: "viewer", scopes: ["operator.read"] },
            policy: { tickIntervalMs: 30000 },
          },
        });
        return;
      }
      if (!connected) { send({ type: "res", id: frame.id, ok: false, error: { code: "not_connected", message: "Send connect first." } }); return; }
      send(handle(frame, send));
    });
    ws.on("close", () => { clearTimeout(timer); viewers.delete(send); });
    ws.on("error", () => viewers.delete(send));
  });

  const port = opts.port ?? Number(process.env.PAIRSIGHT_CONTROLROOM_WS_PORT ?? 3411);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    wss.once("error", reject);
    server.listen(port, host, () => {
      const actual = (server.address() as { port: number }).port;
      resolve({
        server, port: actual, url: `ws://${host === "::1" ? "[::1]" : host}:${actual}`, push,
        reset: () => { generation++; history.clear(); runs.clear(); queues.clear(); openRuns.clear(); },
        drain: async () => { await Promise.all(queues.values()); },
        finishHearing: async () => {
          await Promise.all(queues.values());
          if (openRuns.size) throw new Error("Cannot finish a hearing with active seats.");
          if (!closed) broadcast(presence());
        },
        close: () => new Promise((r) => { closed = true; generation++; for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }),
      });
    });
  });
}

