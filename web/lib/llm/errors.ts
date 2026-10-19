export type LLMFailure = "rate_limit" | "configuration" | "privacy" | "upstream" | "invalid_response";

/** Never attach upstream bodies, URLs, request headers or an Error cause. */
export class LLMUnavailable extends Error {
  constructor(readonly code: LLMFailure, readonly requestSent = true) {
    super(`LLM unavailable (${code}); details redacted`);
    this.name = "LLMUnavailable";
  }
}

/** Defense in depth for model output, including accidentally echoed credentials. */
export function maskLLMSecrets(text: string): string {
  for (const key of [process.env.GEMINI_API_KEY, process.env.GOOGLE_FACTCHECK_API_KEY]) {
    if (key) text = text.split(key).join("[REDACTED]");
  }
  return text
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\bAQ\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]");
}
