import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  FetchedImage,
  ImageInput,
  PageImage,
  ReverseSearchProvider,
  ReverseSearchResult,
  SignalProvider,
  UrlImageExtractor,
} from "../types";
import { ProviderError } from "../types";
import { SCENARIO_DATA, SCENARIOS, type Scenario } from "./fixtures";

const FIXTURE_DIR = join(process.cwd(), "public", "fixtures", "inputs");
export const DEMO_HOST = "demo.pairsight.test";

let byHash: Map<string, Scenario> | null = null;

async function scenarioIndex(): Promise<Map<string, Scenario>> {
  if (byHash) return byHash;
  const map = new Map<string, Scenario>();
  for (const file of await readdir(FIXTURE_DIR)) {
    const name = file.replace(/\.png$/, "") as Scenario;
    if (!SCENARIOS.includes(name)) continue;
    const bytes = await readFile(join(FIXTURE_DIR, file));
    map.set(createHash("sha256").update(bytes).digest("hex"), name);
  }
  byHash = map;
  return map;
}

// Unknown images (anything that is not a fixture) behave like 원본 없음: the honest mock answer.
export async function scenarioFor(sha256: string): Promise<Scenario> {
  return (await scenarioIndex()).get(sha256) ?? "no_source";
}

const MOCK_LATENCY_MS = Number(process.env.PAIRSIGHT_MOCK_DELAY_MS ?? 700);
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

export class MockReverseSearchProvider implements ReverseSearchProvider {
  readonly name = "mock";
  async search(image: ImageInput, signal: AbortSignal): Promise<ReverseSearchResult> {
    await wait(MOCK_LATENCY_MS, signal);
    const s = await scenarioFor(image.sha256);
    const data = SCENARIO_DATA[s];
    if (data.fail === "provider_timeout") {
      throw new ProviderError("provider_timeout", "mock reverse search timed out");
    }
    return { matches: data.matches, searchedProviders: ["Google (모의)", "TinEye (모의)"] };
  }
}

export class MockSignalProvider implements SignalProvider {
  readonly name = "mock";
  async collect(image: ImageInput, signal: AbortSignal) {
    await wait(MOCK_LATENCY_MS, signal);
    return SCENARIO_DATA[await scenarioFor(image.sha256)].evidence;
  }
}

// https://demo.pairsight.test/news/<scenario> is a fake article holding that scenario's image
// (plus a decoy logo), so the URL flow can be tested without touching the network.
export class MockUrlImageExtractor implements UrlImageExtractor {
  readonly name = "mock";
  handles(url: string) {
    try {
      return new URL(url).hostname === DEMO_HOST;
    } catch {
      return false;
    }
  }
  async listImages(pageUrl: string): Promise<PageImage[]> {
    const s = new URL(pageUrl).pathname.split("/").pop() as Scenario;
    if (!SCENARIOS.includes(s)) throw new ProviderError("url_no_image", "demo page has no images");
    return [
      { url: `https://${DEMO_HOST}/img/${s}.png`, alt: "기사 본문 사진" },
      { url: `https://${DEMO_HOST}/img/logo.png`, alt: "사이트 로고" },
    ];
  }
  async fetchImage(imageUrl: string): Promise<FetchedImage> {
    const name = new URL(imageUrl).pathname.split("/").pop()!;
    const s = name.replace(/\.png$/, "");
    const file = SCENARIOS.includes(s as Scenario) ? `${s}.png` : "no_source.png";
    return { bytes: new Uint8Array(await readFile(join(FIXTURE_DIR, file))), mime: "image/png" };
  }
}
