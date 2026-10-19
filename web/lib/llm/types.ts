// LLM boundary for the courtroom layer (replica/newsroom-court.md).
// Deliberately no tools, no function calling, no browsing: a provider turns one prompt into one JSON text.
// Everything the model says is validated by code before it can matter.

export type AgentRole = "prosecutor" | "defense" | "juror" | "clerk";

export interface LLMRequest {
  role: AgentRole; // for logging and the mock provider; never sent as an instruction by itself
  system: string; // fixed instructions written in this repo
  prompt: string; // the case file: code-built JSON, untrusted page text included only as escaped data
  schema: Record<string, unknown>; // JSON schema the answer must follow (Ollama structured output)
  maxTokens?: number;
}

export interface LLMStats {
  promptTokens: number | null;
  outputTokens: number | null;
  totalMs: number;
  loadMs: number | null;
}

export interface LLMResponse {
  text: string; // expected to be JSON; parsing and validation happen in the caller
  stats: LLMStats;
}

export interface LLMProvider {
  readonly name: string;
  generate(req: LLMRequest, signal: AbortSignal): Promise<LLMResponse>;
}
