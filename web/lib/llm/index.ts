import { GeminiProvider } from "./gemini";
import { MockLLMProvider } from "./mock";
import { OllamaProvider, type OllamaOptions } from "./ollama";
import { LLMUnavailable } from "./errors";
import type { LLMProvider } from "./types";

/** Safe offline default. Explicit selection is required before data can leave the server. */
export function createLLMProvider(selection = process.env.PAIRSIGHT_LLM ?? "mock", ollama: OllamaOptions = {}): LLMProvider {
  switch (selection) {
    case "mock": return new MockLLMProvider();
    case "ollama": return new OllamaProvider(ollama);
    case "gemini": return new GeminiProvider();
    default: throw new LLMUnavailable("configuration", false);
  }
}
