import { LLMUnavailable, maskLLMSecrets } from "./errors";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";

const FACTS = new Set(["pHashDistance", "alignedDistance", "alignmentScore", "changedFraction", "diffAreaFraction",
  "outsideResidual", "diffRegions", "diffRegionCount", "sceneSimilarity", "colorAdjusted", "cropped", "dateDisputed", "isEarliest"]);
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function text(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  // Reject media embedded in a string too. Do this BEFORE truncation.
  if (/data:|blob:|base64|[A-Za-z0-9+/_-]{128,}/i.test(v)) throw new LLMUnavailable("privacy", false);
  return maskLLMSecrets(v).replace(/https?:\/\/\S+/gi, "[URL omitted]").slice(0, max);
}
const statements = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 4).map((s) => {
  const o = object(s);
  return { id: text(o.id, 20), kind: text(o.kind, 40), text: text(o.text),
    cite: (Array.isArray(o.cite) ? o.cite : []).slice(0, 8).map((c) => text(c, 20)) };
});

/** Allowlist projection at the outbound boundary. No upload, thumbnail, URL, caption or page excerpt.
 * Unknown fields are dropped; text-encoded media in permitted fields is rejected before any request.
 */
export function geminiCaseSummary(prompt: string): string {
  const match = /^<case_file>\s*([\s\S]*)\s*<\/case_file>$/.exec(prompt);
  if (!match || prompt.length > 100_000) throw new LLMUnavailable("privacy", false);
  let raw: Record<string, unknown>;
  try { raw = object(JSON.parse(match[1])); } catch { throw new LLMUnavailable("privacy", false); }
  if (!Array.isArray(raw.cards) || !raw.judge) throw new LLMUnavailable("privacy", false);
  const judge = object(raw.judge), args = object(raw.arguments);
  const cards = raw.cards.slice(0, 32).map((c) => {
    const o = object(c), facts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(object(o.facts))) {
      if (FACTS.has(k) && (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)))) facts[k] = v;
      if (k === "dateSource" && ["page_meta", "wayback_first_capture", "search_discovered", "tineye_crawl"].includes(String(v))) facts[k] = v;
      if (k === "flip" && (v === null || v === "horizontal" || v === "vertical")) facts[k] = v;
    }
    return { id: text(o.id, 20), kind: text(o.kind, 40), outcome: text(o.outcome, 40), strength: text(o.strength, 20),
      summary: text(o.summary), date: typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null, facts };
  });
  return `<case_file>\n${JSON.stringify({ judge: { verdict: text(judge.verdict, 40), rule: text(judge.rule, 80) }, cards,
    arguments: { prosecution: statements(args.prosecution), defense: statements(args.defense) },
    finalVerdict: text(raw.finalVerdict, 40), jurorDoubts: statements(raw.jurorDoubts),
  }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}\n</case_file>`;
}

export class GeminiProvider implements LLMProvider {
  readonly name: string;
  private readonly model: string;
  constructor(model = process.env.PAIRSIGHT_GEMINI_MODEL ?? "gemini-3.8-flash") {
    if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model)) throw new LLMUnavailable("configuration", false);
    this.model = model;
    this.name = `gemini:${model}`;
  }

  async generate(req: LLMRequest, signal: AbortSignal): Promise<LLMResponse> {
    // Do not accept callers smuggling multipart/image/tool fields through a cast.
    if (Object.keys(req).some((k) => !["role", "system", "prompt", "schema", "maxTokens"].includes(k))) throw new LLMUnavailable("privacy", false);
    const prompt = geminiCaseSummary(req.prompt);
    const system = text(req.system, 8000);
    let schema: unknown;
    try { schema = JSON.parse(text(JSON.stringify(req.schema), 20000)); }
    catch { throw new LLMUnavailable("privacy", false); }
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new LLMUnavailable("configuration", false);
    const started = performance.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        method: "POST", redirect: "error", signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: req.maxTokens ?? 2048,
            responseMimeType: "application/json", responseJsonSchema: schema } }),
      });
      // No SDK retries, no backoff, no upstream error body reading/logging.
      if (!res.ok) {
        await res.body?.cancel();
        throw new LLMUnavailable(res.status === 429 ? "rate_limit" : "upstream");
      }
      const body = await res.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const candidate = body.candidates?.[0];
      const answer = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!answer || candidate?.finishReason !== "STOP") throw new LLMUnavailable("invalid_response");
      return { text: maskLLMSecrets(answer), stats: { promptTokens: body.usageMetadata?.promptTokenCount ?? null,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? null, totalMs: Math.round(performance.now() - started), loadMs: null } };
    } catch (e) {
      if (e instanceof LLMUnavailable) throw e;
      // Even fetch/JSON/abort errors may contain headers, input or URLs. Never propagate their causes.
      throw new LLMUnavailable("upstream");
    }
  }
}
