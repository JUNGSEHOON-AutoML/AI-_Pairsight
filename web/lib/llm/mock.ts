// Scripted LLM for tests and the mock app mode. Each role gets a function from the request to an answer;
// answers are serialised exactly like a model's JSON text, so the same validation path runs.
import type { AgentRole, LLMProvider, LLMRequest, LLMResponse } from "./types";

export type MockScript = Partial<Record<AgentRole, (req: LLMRequest, call: number) => unknown>>;

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock-llm";
  readonly requests: LLMRequest[] = [];
  private counts: Partial<Record<AgentRole, number>> = {};
  constructor(private script: MockScript = {}) {}

  async generate(req: LLMRequest, signal: AbortSignal): Promise<LLMResponse> {
    signal.throwIfAborted();
    this.requests.push(req);
    const call = (this.counts[req.role] = (this.counts[req.role] ?? 0) + 1) - 1;
    const answer = this.script[req.role]?.(req, call) ?? defaultAnswer(req.role);
    return { text: typeof answer === "string" ? answer : JSON.stringify(answer), stats: { promptTokens: null, outputTokens: null, totalMs: 0, loadMs: null } };
  }
}

/** A cautious default: no claims, jurors uphold, the clerk writes nothing (code fallback is used). */
function defaultAnswer(role: AgentRole): unknown {
  if (role === "prosecutor") return { claims: [] };
  if (role === "defense") return { alternatives: [] };
  if (role === "juror") return { decision: "uphold", doubt: null };
  return {};
}
