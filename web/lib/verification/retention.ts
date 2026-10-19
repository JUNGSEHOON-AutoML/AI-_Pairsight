import sharp from "sharp";
import { createHash } from "node:crypto";

export const excerpt = (s: string) => Array.from(s.replace(/\s+/g, " ").trim()).slice(0, 200).join("");
export const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const DECODE_LIMIT = 20_000_000;

/** Decode under a pixel budget, strip metadata, keep only a <= 512px thumbnail. */
export async function thumbnail(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await sharp(bytes, { limitInputPixels: DECODE_LIMIT, pages: 1 })
    .rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toBuffer());
}

export function publicUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    // Temporary image access tokens must never enter evidence, history, logs or an LLM prompt.
    if ([...url.searchParams.keys()].some(k => /token|signature|credential|api.?key/i.test(k))) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
