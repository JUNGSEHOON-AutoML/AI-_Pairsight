import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { classify, parseCase, summarize } from "../eval/metrics";
import { pickProviders } from "../eval/providers";
import { GoogleVisionReverseSearch, type FetchLike } from "../lib/providers/google-vision";
import { ProviderError } from "../lib/providers/types";

describe("eval metrics", () => {
  it("classifies outcomes", () => {
    expect(classify("edited", "edited")).toBe("correct");
    expect(classify("edited", "inconclusive")).toBe("abstain");
    expect(classify("authentic", "edited")).toBe("opposite");
    expect(classify("miscontextualized", "authentic")).toBe("opposite");
    expect(classify("edited", "miscontextualized")).toBe("wrong_type");
    expect(classify("inconclusive", "authentic")).toBe("unfounded");
    expect(classify("edited", null)).toBe("error");
  });

  it("summarizes distribution, inconclusive rate and decisive accuracy", () => {
    const s = summarize([
      { id: "a", label: "edited", predicted: "edited" },
      { id: "b", label: "edited", predicted: "inconclusive" },
      { id: "c", label: "authentic", predicted: "miscontextualized" },
      { id: "d", label: "authentic", predicted: null },
    ]);
    expect(s).toMatchObject({ total: 4, ran: 3, inconclusiveRate: 1 / 3, decisiveAccuracy: 0.5 });
    expect(s.byOutcome.opposite).toEqual(["c"]);
    expect(s.byOutcome.error).toEqual(["d"]);
    expect(s.confusion.authentic.miscontextualized).toBe(1);
  });

  it("parses cases and rejects bad ones with the line number", () => {
    expect(parseCase('{"id":"x","image":"images/x.jpg","label":"edited","claim":"","claimedDate":null}', 3)).toMatchObject({ id: "x", claimedDate: null });
    expect(() => parseCase('{"id":"x","image":"a.jpg","label":"fake"}', 7)).toThrow(/line 7: label/);
    expect(() => parseCase('{"id":"x","image":"a.jpg","label":"edited","claimedDate":"2026/10/01"}', 2)).toThrow(/YYYY-MM-DD/);
    expect(() => parseCase(`{"id":"x","image":"a.jpg","label":"edited","claim":"${"가".repeat(201)}"}`, 1)).toThrow(/200/);
    expect(() => parseCase("{nope", 9)).toThrow(/line 9/);
  });

  it("falls back to mock providers without a key", () => {
    const saved = process.env.GOOGLE_VISION_API_KEY;
    delete process.env.GOOGLE_VISION_API_KEY;
    expect(pickProviders({ forceMock: false }).mode).toBe("mock");
    process.env.GOOGLE_VISION_API_KEY = "test-key";
    expect(pickProviders({ forceMock: false }).mode).toBe("live");
    expect(pickProviders({ forceMock: true }).mode).toBe("mock");
    if (saved == null) delete process.env.GOOGLE_VISION_API_KEY;
    else process.env.GOOGLE_VISION_API_KEY = saved;
  });
});

describe("Google Vision adapter (fake transport, no network)", () => {
  const image = async () => ({ bytes: new Uint8Array(await readFile("public/fixtures/inputs/edited.png")), mime: "image/png", sha256: "x", publicUrl: null });

  it("sends the key only in a header, strips metadata to JPEG, and maps pages to candidates", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 200, json: async () => ({ responses: [{ webDetection: { pagesWithMatchingImages: [
        { url: "https://www.yna.co.kr/view/1", fullMatchingImages: [{ url: "https://img.yna.co.kr/a.jpg" }] },
        { url: "https://blog.example.com/p", partialMatchingImages: [{ url: "https://blog.example.com/b.jpg" }] },
        { url: "javascript:alert(1)" },
        { pageTitle: "no url" },
      ] } }] }) };
    };
    const r = await new GoogleVisionReverseSearch("secret-key", fake).search(await image(), AbortSignal.timeout(10000));
    expect(calls[0].url).toBe("https://vision.googleapis.com/v1/images:annotate");
    expect(calls[0].url).not.toContain("secret-key");
    expect(calls[0].headers["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(calls[0].body);
    expect(body.requests[0].features[0].type).toBe("WEB_DETECTION");
    expect(Buffer.from(body.requests[0].image.content, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG
    expect(r.candidates).toEqual([
      { url: "https://www.yna.co.kr/view/1", provider: "google-vision-web-detection", imageUrl: "https://img.yna.co.kr/a.jpg" },
      { url: "https://blog.example.com/p", provider: "google-vision-web-detection", imageUrl: "https://blog.example.com/b.jpg" },
    ]);
    expect(r.candidates.every((c) => !("discoveredAt" in c))).toBe(true); // Vision gives no dates
  });

  it("maps HTTP errors and API errors to provider failures without leaking the key", async () => {
    const http: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const api: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ responses: [{ error: { code: 7, message: "API key secret-key invalid" } }] }) });
    for (const f of [http, api]) {
      const err = await new GoogleVisionReverseSearch("secret-key", f).search(await image(), AbortSignal.timeout(10000)).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(String(err.message)).not.toContain("secret-key");
    }
  });

  it("refuses to be constructed without a key", () => {
    expect(() => new GoogleVisionReverseSearch("")).toThrow();
  });
});
