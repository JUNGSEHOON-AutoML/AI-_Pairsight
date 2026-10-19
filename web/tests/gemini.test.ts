import { afterEach, describe, expect, it, vi } from "vitest";
import { createLLMProvider } from "../lib/llm";
import { GeminiProvider } from "../lib/llm/gemini";
import { LLMUnavailable } from "../lib/llm/errors";
import { runCourt, type CourtInput } from "../lib/court/court";
import { renderCaseFile, type Docket } from "../lib/court/docket";
import { SCHEMA, SYSTEM } from "../lib/court/prompts";
import type { LLMRequest } from "../lib/llm/types";

const fakeKey = "unit-test-placeholder-never-a-real-key";
const docket: Docket = { judge: { verdict: "edited", rule: "v3.trusted_edited", reason: "local edit", missing: [] },
  cards: [{ id: "E1", kind: "image_comparison", label: "comparison", outcome: "supports_manipulated", strength: "medium",
    summary: "차이 영역 1곳", sourceUrl: "https://private.test/signed?token=hidden", date: null,
    facts: { outsideResidual: .004, upload: "data:image/png;base64,original", imageUrl: "https://private.test/original.png" },
    untrustedPageText: "PRIVATE_PAGE_EXCERPT" }] };
const request = (): LLMRequest => ({ role: "prosecutor", system: SYSTEM.prosecutor, prompt: renderCaseFile(docket), schema: SCHEMA.prosecutor });
const ok = (text = '{"claims":[]}') => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 } }));
const input: CourtInput = { verdict: { verdict: "edited", reason: "차이", missing: [], rule: "v3.trusted_edited", strength: "medium", headlineFinding: null },
  evidence: [], matches: [] };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Gemini privacy boundary", () => {
  it("sends only evidence summaries and numeric facts; never original bytes, URLs or excerpts", async () => {
    vi.stubEnv("GEMINI_API_KEY", fakeKey);
    const fetcher = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetcher);
    await new GeminiProvider().generate(request(), new AbortController().signal);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).not.toContain(fakeKey);
    expect(options.headers["x-goog-api-key"]).toBe(fakeKey);
    const payload = JSON.parse(options.body);
    expect(payload.contents[0].parts).toHaveLength(1);
    expect(Object.keys(payload.contents[0].parts[0])).toEqual(["text"]);
    expect(options.body).toContain("outsideResidual");
    for (const forbidden of [fakeKey, "private.test", "PRIVATE_PAGE_EXCERPT", "data:image", "inlineData", "fileData", "tools", "original"])
      expect(options.body.includes(forbidden)).toBe(false);
    expect(options.redirect).toBe("error");
  });
  it("rejects multipart additions and media hidden in summary text before making a request", async () => {
    vi.stubEnv("GEMINI_API_KEY", fakeKey); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const media = { ...request(), images: [new Uint8Array([1, 2, 3])] };
    await expect(new GeminiProvider().generate(media, new AbortController().signal)).rejects.toMatchObject({ code: "privacy" });
    const q = request(); q.prompt = renderCaseFile({ ...docket, cards: [{ ...docket.cards[0], summary: "data:image/png;base64,abc" }] });
    await expect(new GeminiProvider().generate(q, new AbortController().signal)).rejects.toMatchObject({ code: "privacy" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("redacts model output and discards upstream error messages/causes entirely", async () => {
    vi.stubEnv("GEMINI_API_KEY", fakeKey);
    const fetcher = vi.fn().mockResolvedValueOnce(ok(fakeKey)).mockRejectedValueOnce(new Error(`request failed: ${fakeKey}`))
      .mockResolvedValueOnce(new Response(fakeKey, { status: 400 })); vi.stubGlobal("fetch", fetcher);
    const llm = new GeminiProvider(), signal = new AbortController().signal;
    expect((await llm.generate(request(), signal)).text).toBe("[REDACTED]");
    for (let i = 0; i < 2; i++) {
      const error = await llm.generate(request(), signal).catch((e) => e as Error);
      expect(String(error).includes(fakeKey)).toBe(false);
      expect(error).toBeInstanceOf(LLMUnavailable);
      if (error instanceof Error) expect(error.cause).toBeUndefined();
    }
  });
});

describe("hearing termination and provider selection", () => {
  it.each([1, 2, 3, 4, 5, 6])("429 at call %i ends the hearing without retrying or later roles", async (at) => {
    vi.stubEnv("GEMINI_API_KEY", fakeKey);
    let count = 0;
    const fetcher = vi.fn(async () => ++count === at ? new Response(fakeKey, { status: 429, headers: { "retry-after": "60" } }) : ok("{}"));
    vi.stubGlobal("fetch", fetcher);
    const events: string[] = [];
    const result = await runCourt(input, new GeminiProvider(), new AbortController().signal, { onEvent: (e) => events.push(e.summary ?? "") });
    expect(fetcher).toHaveBeenCalledTimes(at);
    expect(result.llmCalls).toBe(at);
    expect(result.reviewStatus).toBe("unavailable");
    expect(result.failureCode).toBe("rate_limit");
    expect(result.finalVerdict).toBe("inconclusive");
    expect(result.judgeVerdict).toBe("edited");
    expect(result.judgment.headline).toContain("맥락·법정 확인 못 함");
    expect(events.some((e) => e.includes("3명이 유지"))).toBe(false);
    expect(JSON.stringify(result).includes(fakeKey)).toBe(false);
  });
  it("missing credentials make no HTTP calls; normal Gemini hearing records six calls", async () => {
    vi.stubEnv("GEMINI_API_KEY", ""); const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok("{}"))); vi.stubGlobal("fetch", fetcher);
    const missing = await runCourt(input, new GeminiProvider(), new AbortController().signal);
    expect(missing.llmCalls).toBe(0); expect(missing.failureCode).toBe("configuration"); expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("GEMINI_API_KEY", fakeKey);
    const complete = await runCourt(input, new GeminiProvider(), new AbortController().signal);
    expect(complete.llmCalls).toBe(6); expect(complete.reviewStatus).toBe("complete");
    expect(complete.finalVerdict).toBe("edited");
  });
  it("retains mock and Ollama and rejects unknown selectors without echoing them", () => {
    for (const name of ["gemini", "ollama", "mock"]) {
      vi.stubEnv("PAIRSIGHT_LLM", name); expect(createLLMProvider().name).toContain(name === "mock" ? "mock" : `${name}:`);
    }
    expect(() => createLLMProvider("invalid")).toThrow(LLMUnavailable);
  });
});
