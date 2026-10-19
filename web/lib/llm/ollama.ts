// Local Ollama server. Only loopback addresses are accepted: case files never leave the machine,
// and a misconfigured URL cannot turn this into a request to an arbitrary host.
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export interface OllamaOptions {
  baseUrl?: string; // default PAIRSIGHT_OLLAMA_URL or http://127.0.0.1:11434
  model?: string; // default PAIRSIGHT_OLLAMA_MODEL or qwen2.5:7b
  numThread?: number; // CPU threads; default PAIRSIGHT_OLLAMA_THREADS or Ollama's own choice
  numCtx?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name: string;
  private base: URL;
  private model: string;
  constructor(private opts: OllamaOptions = {}) {
    this.base = new URL(opts.baseUrl ?? process.env.PAIRSIGHT_OLLAMA_URL ?? "http://127.0.0.1:11434");
    if (!LOOPBACK.has(this.base.hostname) || !["http:", "https:"].includes(this.base.protocol)) {
      throw new Error(`Ollama URL must be a loopback address, got ${this.base.host}`);
    }
    this.model = opts.model ?? process.env.PAIRSIGHT_OLLAMA_MODEL ?? "qwen2.5:7b";
    this.name = `ollama:${this.model}`;
  }

  async generate(req: LLMRequest, signal: AbortSignal): Promise<LLMResponse> {
    const started = performance.now();
    const threads = this.opts.numThread ?? (process.env.PAIRSIGHT_OLLAMA_THREADS ? Number(process.env.PAIRSIGHT_OLLAMA_THREADS) : undefined);
    const res = await fetch(new URL("/api/chat", this.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: req.schema,
        keep_alive: "10m",
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
        options: { temperature: 0, num_predict: req.maxTokens ?? 700, num_ctx: this.opts.numCtx ?? 8192, ...(threads ? { num_thread: threads } : {}) },
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      load_duration?: number;
    };
    return {
      text: body.message?.content ?? "",
      stats: {
        promptTokens: body.prompt_eval_count ?? null,
        outputTokens: body.eval_count ?? null,
        totalMs: Math.round(performance.now() - started),
        loadMs: body.load_duration ? Math.round(body.load_duration / 1e6) : null,
      },
    };
  }
}
