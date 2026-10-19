// Replays one mock hearing, start to finish, through the read-only Claw3D control-room adapters:
//   WebSocket gateway (3411, Claw3D "Demo backend" protocol: the office animates each seat) and
//   custom HTTP runtime (3410, seat list only).
//   PAIRSIGHT_CONTROLROOM_TOKEN=<24+ chars> npx tsx scripts/controlroom-demo.ts [--step-ms 4000] [--frame-gap-ms 1000] [--loop] [--once]
// Claw3D setup: replica/controlroom.md §3.
// The case is the fictional trusted_edited fixture through the real pipeline (mock transport) and rules v3;
// only the agents are scripted. Nothing here can change a verdict: the adapter only reads court events.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { runCourt } from "../lib/court/court";
import { applyEvent, emptyState, type ControlRoomState } from "../lib/controlroom/state";
import { startGateway, type Gateway } from "../lib/controlroom/gateway";
import { checkToken, startControlRoom } from "../lib/controlroom/server";
import { MockLLMProvider } from "../lib/llm/mock";
import type { LLMProvider, LLMRequest } from "../lib/llm/types";
import { createFreeProviders } from "../lib/providers";
import { decideVerdict } from "../lib/verdict";
import { collectEvidence } from "../lib/verification/engine";
import { mockTransport } from "../lib/verification/mock";
import { loadTrustedSources } from "../lib/verification/trusted-sources";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const STEP_MS = Number(arg("--step-ms") ?? 4000);

/** Picks real card IDs out of the case file so scripted answers cite what exists. */
function cards(req: LLMRequest): { id: string; kind: string }[] {
  const json = req.prompt.replace(/^<case_file>\n/, "").replace(/\n<\/case_file>$/, "");
  return (JSON.parse(json).cards ?? []) as { id: string; kind: string }[];
}
const pick = (req: LLMRequest, kinds: string[]) => cards(req).filter((c) => kinds.includes(c.kind)).map((c) => c.id).slice(0, 2);

const scripted = new MockLLMProvider({
  prosecutor: (req) => ({ claims: [
    { text: "신뢰 출처 페이지의 더 이른 사진과 비교하면 오른쪽 아래 영역만 달라요.", cite: pick(req, ["image_comparison", "source_page"]) },
    { text: "누가 바꿨는지 알 수 있어요.", cite: [] }, // no citation: the court discards it
  ] }),
  defense: (req) => ({ alternatives: [
    { kind: "same_place_different_time", text: "같은 골목을 다른 날 찍은 사진일 수 있어요.", cite: pick(req, ["source_page"]) },
    { kind: "date_error", text: "게시일이 틀렸을 수 있어요.", cite: pick(req, ["source_page"]) },
  ] }),
  juror: (req, call) => call === 2
    ? { decision: "authentic", doubt: null } // tries to change the verdict: rejected, counted as uphold
    : { decision: "uphold", doubt: null },
  clerk: (req) => ({ summary: { text: "신뢰 출처의 더 이른 사진과 비교해 국소 차이가 확인됐어요.", cite: pick(req, ["source_page", "image_comparison"]) } }),
});

/** Slows each call down so the office shows who is working. */
const paced = (inner: LLMProvider, ms: number): LLMProvider => ({
  name: inner.name,
  generate: async (req, signal) => { await new Promise((r) => setTimeout(r, ms)); return inner.generate(req, signal); },
});

export async function hearing(onState: (s: ControlRoomState) => void, gateway: Gateway, stepMs = STEP_MS) {
  const signal = AbortSignal.timeout(10 * 60_000);
  const p = {
    ...createFreeProviders(mockTransport, "/nonexistent/index.jsonl"),
    reverseSearch: { name: "fixed", search: async () => ({ candidates: [{ url: "https://wire.example.test/2021/04/old-house", provider: "fixed" }], searchedProviders: [] }) },
  };
  const input = await p.input.normalize({ bytes: new Uint8Array(await readFile("public/fixtures/inputs/trusted_edited.png")), mime: "image/png", pageUrl: null, publicImageUrl: null }, signal);
  const c = await collectEvidence(input, p, signal);
  const verdict = decideVerdict({ evidence: c.evidence, matches: c.matches, claimedDate: null, trustedSources: loadTrustedSources({ includeMock: true }) });
  let state: ControlRoomState = { ...emptyState(scripted.name), caseId: "demo-trusted-edited" };
  onState(state);
  const record = await runCourt({ verdict, evidence: c.evidence, matches: c.matches }, paced(scripted, stepMs), signal, {
    onEvent: (e) => {
      state = applyEvent(state, e);
      onState(state);
      gateway.push(e);
      console.log(`[${e.seq}] ${e.seat} ${e.status}${e.summary ? ` — ${e.summary}` : ""}${e.cite.length ? ` [${e.cite.join(",")}]` : ""}${e.rejected ? ` (폐기 ${e.rejected})` : ""}`);
    },
  });
  console.log(`\n${record.judgment.headline}`);
}

async function main() {
  const token = checkToken(process.env.PAIRSIGHT_CONTROLROOM_TOKEN);
  let current = emptyState("mock-llm");
  const { server, baseUrl } = await startControlRoom({ token, getState: () => current });
  const gateway = await startGateway({ token, getState: () => current, frameGapMs: Number(arg("--frame-gap-ms") ?? 1000) });
  console.log(`관제실 WebSocket 게이트웨이: ${gateway.url} (Claw3D Demo backend, 토큰은 CLAW3D_GATEWAY_TOKEN)`);
  console.log(`관제실 HTTP 런타임: ${baseUrl.replace(token, "<token>")} (Custom backend, 좌석 명단만)`);
  console.log("둘 다 127.0.0.1 전용, 보기 전용.\n");
  if (process.argv.includes("--wait-for-enter")) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    await prompt.question("Claw3D에 좌석 7개가 보이면 Enter를 눌러 재생하세요. ");
    prompt.close();
  }
  do {
    gateway.reset();
    await hearing((s) => { current = s; }, gateway);
    await gateway.finishHearing(); // Drain speech, then reconcile the completed transcript in the office.
    if (process.argv.includes("--loop")) await new Promise((r) => setTimeout(r, STEP_MS * 3));
  } while (process.argv.includes("--loop"));
  if (process.argv.includes("--once")) { server.close(); await gateway.close(); }
  else console.log("\n재생이 끝났어요. 마지막 상태를 계속 보여줘요. 끝내려면 Ctrl+C.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
