import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { scenarioFor, MockSignalProvider } from "../providers/mock";
import { SCENARIOS, SCENARIO_DATA, MOCK_CLAIM, type Scenario } from "../providers/mock/fixtures";
import { ProviderError, type ImageInput } from "../providers/types";
import type { ArchiveDateProvider, ContextComparisonProvider, ContextInput, ContextObservation, FactCheckProvider, FactCheckRecord, ProvenanceProvider, TemporaryImageProvider } from "./types";
import type { Transport } from "./page-fetch";
import { LocalMetadataProvider } from "./adapters";
import { thumbnail, hash } from "./retention";

const root = join(process.cwd(), "public", "fixtures");
const sourceCaption = "2019년 3월 2일 부산의 겨울 시장. 당시 행사 사진이다.";
const reviewUrl = "https://factcheck.example.test/claims/winter-market";
const imageUrl = (s: string) => "https://assets.example.test/originals/" + s + ".png";
const response = (status: number, body: string | Uint8Array, type = "text/html") => ({
  status, headers: { "content-type": type }, bytes: typeof body === "string" ? new TextEncoder().encode(body) : body,
});
const pageHtml = (s: Scenario, review = false) => {
  const date = ["miscontextualized", "fact_check_found"].includes(s) ? "2019-03-02" : SCENARIO_DATA[s].matches[0]?.firstSeenAt;
  const caption = ["miscontextualized", "fact_check_found"].includes(s) ? sourceCaption : `${date ?? "날짜 미상"} 골목 카페 거리의 촬영 예시. 가상의 페이지다.`;
  const img = imageUrl(s);
  return '<html><head><title>모의 기사</title>' + (date ? '<meta property="article:published_time" content="' + date + '">' : '') +
    '<meta property="og:image" content="' + img + '">' + (review ? '<script type="application/ld+json">' + JSON.stringify({
      "@type": "ClaimReview", claimReviewed: MOCK_CLAIM, reviewRating: { alternateName: "사실과 다름" }, author: { name: "예시 팩트체크 센터 (가상)" },
    }) + '</script>' : '') + '</head><body><article><figure><img src="' + img + '"><figcaption>' + caption + '</figcaption></figure></article></body></html>';
};

/** No network: fixtures still pass through the actual robots/status/HTML-extraction policy. */
export const mockTransport: Transport = async (raw, signal) => {
  signal.throwIfAborted();
  const url = new URL(raw);
  const knownHosts = ["news.example.test", "photos.example.test", "archive.example.test", "blog.example.test", "factcheck.example.test", "assets.example.test", "demo.pairsight.test", "wire.example.test", "gov.example.test"];
  if (!knownHosts.includes(url.hostname)) throw new ProviderError("url_blocked", "mock mode accepts only fixture pages");
  if (url.pathname === "/robots.txt") return response(200, "User-agent: *\nAllow: /\n", "text/plain");
  // Scene fixtures (public/fixtures/scenes): one dated page per scene on the fictional trusted wire.
  const scene = url.pathname.match(/^\/scenes\/([a-z_]+?)(\.png)?$/);
  if (scene && url.hostname === "assets.example.test" && scene[2]) {
    try { return response(200, new Uint8Array(await readFile(join(root, "scenes", scene[1] + ".png"))), "image/png"); }
    catch { return response(404, "not found"); }
  }
  if (scene && url.hostname === "wire.example.test" && !scene[2]) {
    const img = "https://assets.example.test/scenes/" + scene[1] + ".png";
    return response(200, '<html><head><title>모의 기사</title><meta property="article:published_time" content="2020-05-01"><meta property="og:image" content="' + img +
      '"></head><body><article><figure><img src="' + img + '"><figcaption>2020-05-01 촬영 예시. 가상의 페이지다.</figcaption></figure></article></body></html>');
  }
  if (url.hostname === "assets.example.test" || url.pathname.startsWith("/img/")) {
    const s = url.pathname.split("/").pop()!.replace(/\.png$/, "") as Scenario;
    if (!SCENARIOS.includes(s)) return response(404, "not found");
    const file = s === "fact_check_found" && !url.pathname.startsWith("/img/") ? "miscontextualized" : s;
    const folder = url.pathname.startsWith("/img/") ? "inputs" : "originals";
    try { return response(200, new Uint8Array(await readFile(join(root, folder, file + ".png"))), "image/png"); }
    catch { return response(404, "not found"); }
  }
  if (url.hostname === "demo.pairsight.test") {
    const s = url.pathname.split("/").pop() as Scenario;
    if (!SCENARIOS.includes(s)) return response(404, "not found");
    return response(200, pageHtml(s).replaceAll(imageUrl(s), "https://demo.pairsight.test/img/" + s + ".png"));
  }
  if (raw === reviewUrl) return response(200, pageHtml("miscontextualized", true));
  // RSS for the hash-index fixtures: two items with images, one third-party link, one item without an image.
  if (url.hostname === "wire.example.test" && url.pathname === "/rss.xml") {
    return response(200, `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>예시 통신사 (가상)</title>
<item><title>골목 주택</title><link>https://wire.example.test/2021/04/old-house</link><pubDate>Mon, 12 Apr 2021 09:00:00 +0900</pubDate><media:content url="https://assets.example.test/originals/trusted_edited.png" medium="image"/></item>
<item><title>공원 축제</title><link>https://wire.example.test/2018/07/park-festival</link><pubDate>Sat, 21 Jul 2018 10:00:00 +0900</pubDate><enclosure url="https://assets.example.test/originals/trusted_context.png" type="image/png"/></item>
<item><title>외부 블로그</title><link>https://blog.example.test/park-walk</link><media:content url="https://assets.example.test/originals/inconclusive.png" medium="image"/></item>
<item><title>사진 없는 기사</title><link>https://wire.example.test/2021/05/no-photo</link><description>본문만 있어요</description></item>
</channel></rss>`, "application/rss+xml");
  }
  for (const s of SCENARIOS) {
    if (SCENARIO_DATA[s].matches.some(m => m.url === raw)) return response(200, pageHtml(s));
  }
  return response(404, "not found");
};

export class MockArchiveDateProvider implements ArchiveDateProvider {
  readonly name = "wayback-mock";
  async firstCapture(url: string, signal: AbortSignal) {
    signal.throwIfAborted();
    // This fixture explicitly models a capture in which the compared image was verified present.
    if (!url.includes("winter-market")) return null;
    return { value: "2019-03-03", source: "wayback_first_capture" as const, sourceUrl: url,
      confidence: "medium" as const, meaning: "page_capture" as const, imageBound: true, imageHash: hash(await readFile(join(root, "originals", "miscontextualized.png"))) };
  }
}

export class MockTemporaryImageProvider implements TemporaryImageProvider {
  readonly name = "temporary-signed-url-mock";
  private active = new Map<string, { image: ImageInput; until: number }>();
  async publish(image: ImageInput, signal: AbortSignal) {
    signal.throwIfAborted();
    const expires = Date.now() + 5 * 60_000;
    const url = "https://temporary.example.test/image/" + randomUUID() + "?token=" + randomUUID();
    // Only a sanitized thumbnail is temporarily published, not original high-resolution bytes.
    this.active.set(url, { image: { ...image, mime: "image/png", bytes: await thumbnail(image.bytes) }, until: expires });
    return { url, expiresAt: new Date(expires).toISOString(), revoke: async () => { this.active.delete(url); } };
  }
  resolve(url: string) {
    const item = this.active.get(url);
    if (!item || item.until <= Date.now()) { this.active.delete(url); return null; }
    return item.image;
  }
  get activeCount() { return this.active.size; }
}

export class MockFactCheckProvider implements FactCheckProvider {
  readonly name = "Google Fact Check (모의)";
  constructor(private temporary: MockTemporaryImageProvider) {}
  async search(imageUri: string, signal: AbortSignal): Promise<FactCheckRecord[]> {
    signal.throwIfAborted();
    const image = this.temporary.resolve(imageUri);
    if (!image) throw new ProviderError("url_blocked", "temporary image URL unavailable");
    const s = await scenarioFor(image.sha256);
    if (!["miscontextualized", "fact_check_found"].includes(s)) return [];
    return [{ url: reviewUrl, publisher: "예시 팩트체크 센터 (가상)", claim: MOCK_CLAIM, rating: "사실과 다름",
      reviewedAt: "2026-01-10", imageCandidateUrl: reviewUrl, assessment: "miscontextualized", verified: false }];
  }
}

export class MockProvenanceProvider implements ProvenanceProvider {
  readonly name = "provenance-mock-with-local-exif";
  async inspect(image: ImageInput, signal: AbortSignal) {
    const fixture = await new MockSignalProvider().collect(image, signal);
    return [...fixture.filter(e => !["source_match", "fact_check"].includes(e.kind)), ...await new LocalMetadataProvider().inspect(image, signal)];
  }
}

export class MockContextProvider implements ContextComparisonProvider {
  readonly name = "context-llm-mock";
  async compare(input: ContextInput, signal: AbortSignal): Promise<ContextObservation[]> {
    signal.throwIfAborted();
    const source = input.sources.find(s => s.excerpt.includes("부산"));
    if (!source) return [];
    const observations: ContextObservation[] = [];
    const add = (dimension: ContextObservation["dimension"], explanation: string) => observations.push({
      dimension, relation: "mismatch", sourceUrl: source.url, quote: source.excerpt, explanation, strength: "medium",
    });
    if (input.claim.text.includes("서울")) add("place", "캡션은 부산, 입력 주장은 서울이에요. 모의 LLM 관찰이며 단독 결론은 아니에요.");
    if (input.claim.text.includes("2026") || input.claim.date?.startsWith("2026")) add("date", "캡션은 2019년, 입력 주장은 2026년이에요. 모의 LLM 관찰이에요.");
    if (input.claim.text.includes("홍수")) add("event", "캡션은 시장 행사, 입력 주장은 홍수 현장이에요. 모의 LLM 관찰이에요.");
    return observations;
  }
}
