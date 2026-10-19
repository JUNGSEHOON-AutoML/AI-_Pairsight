// Read-only Claw3D "custom runtime" adapter (HTTP). Claw3D probes GET /health, /state, /registry and sends chat to
// POST /v1/chat/completions (Claw3D src/lib/runtime/custom/provider.ts, release v0.1.4 / main 0565b78).
//   - loopback only: refuses to bind anywhere else
//   - token in the runtime URL path (/<token>/state): Claw3D's proxy forwards no auth headers but keeps the path;
//     a wrong token gets the same 404 as an unknown path
//   - read-only: chat never reaches an LLM or the court; it returns the seat's current state. No route mutates.
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Seat } from "../court/court";
import { describeSeat, SEATS, type ControlRoomState } from "./state";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
export const READ_ONLY_NOTICE = "보기 전용 관제실이에요. 판정과 에이전트 설정은 여기서 바꿀 수 없고, 보낸 메시지는 어떤 에이전트에게도 전달되지 않아요.";

export interface ControlRoomOptions {
  token: string;
  host?: string; // default 127.0.0.1
  port?: number; // default PAIRSIGHT_CONTROLROOM_PORT or 3410 (Pairsight 3000, Claw3D 3400)
  getState: () => ControlRoomState;
}

export function checkToken(token: string | undefined): string {
  if (!token || token.length < 24 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("PAIRSIGHT_CONTROLROOM_TOKEN must be set: at least 24 characters of [A-Za-z0-9_-].");
  }
  return token;
}

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
};

async function readBody(req: IncomingMessage, limit = 16 * 1024): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

/** Which seat a Claw3D chat is addressed to: body.role / body.lane, or the agent id inside its session key. */
export function seatFromChat(body: unknown): Seat {
  const b = (body ?? {}) as Record<string, unknown>;
  const ids = SEATS.map((s) => s.id) as string[];
  for (const v of [b.lane, b.role, b.conversation_id, b.session_id]) {
    if (typeof v !== "string") continue;
    const hit = ids.find((id) => v === id || v.includes(`:${id}:`) || v.endsWith(`:${id}`));
    if (hit) return hit as Seat;
  }
  return "clerk";
}

export function runtimeState(state: ControlRoomState) {
  const model = state.model ?? "mock-llm";
  return {
    profileName: "pairsight-court",
    runtime: { name: "Pairsight 법정 관제실 (보기 전용)", version: "1", vendor: "Pairsight", status: state.phase, active_model: model, governance: "read-only" },
    // Claw3D turns each key of `active` into an agent in the office.
    active: Object.fromEntries(SEATS.map((s) => [s.id, [s.id === "judge" ? "rules-v3" : model]])),
    pairsight: { readOnly: true, caseId: state.caseId, phase: state.phase, seats: state.seats, timeline: state.timeline.slice(-30) },
  };
}

export function handle(opts: ControlRoomOptions) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const [first, ...rest] = url.pathname.split("/").filter(Boolean);
    if (!first || !sameToken(first, opts.token)) return json(res, 404, { error: "not found" });
    const path = "/" + rest.join("/");
    const state = opts.getState();
    if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, status: state.phase, readOnly: true });
    if (req.method === "GET" && path === "/state") return json(res, 200, runtimeState(state));
    if (req.method === "GET" && path === "/registry") return json(res, 200, { models: { [state.model ?? "mock-llm"]: { readOnly: true } } });
    if (req.method === "POST" && path === "/v1/chat/completions") {
      let body: unknown;
      try { body = await readBody(req); } catch { return json(res, 413, { error: "too large" }); }
      // The operator's message is ignored on purpose: no LLM, no court, no settings behind this route.
      const seat = seatFromChat(body);
      return json(res, 200, {
        id: `pairsight-${state.timeline.at(-1)?.seq ?? 0}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: state.model ?? "mock-llm",
        choices: [{ index: 0, message: { role: "assistant", content: `${READ_ONLY_NOTICE}\n\n${describeSeat(state, seat)}` }, finish_reason: "stop" }],
      });
    }
    if (["GET", "POST"].includes(req.method ?? "")) return json(res, 404, { error: "not found" });
    return json(res, 405, { error: "read-only" });
  };
}

export function startControlRoom(opts: ControlRoomOptions): Promise<{ server: Server; port: number; baseUrl: string }> {
  const host = opts.host ?? "127.0.0.1";
  if (!LOOPBACK.has(host)) return Promise.reject(new Error(`control room binds to loopback only, got ${host}`));
  try { checkToken(opts.token); } catch (e) { return Promise.reject(e); }
  const server = createServer(handle(opts));
  const port = opts.port ?? Number(process.env.PAIRSIGHT_CONTROLROOM_PORT ?? 3410);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actual = (server.address() as { port: number }).port;
      resolve({ server, port: actual, baseUrl: `http://${host === "::1" ? "[::1]" : host}:${actual}/${opts.token}` });
    });
  });
}
