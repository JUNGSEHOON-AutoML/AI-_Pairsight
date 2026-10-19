// Hashes stored in the RSS index (replica/rss-hash-index.md). Image bytes stay in memory only.
// full   = the app's 64-bit DCT pHash of the whole image
// center = the same hash of the central 70%: survives the edge crops typical of re-shared copies
import sharp from "sharp";
import { hammingDistance, perceptualHash } from "../verification/image-comparison";
import { DECODE_LIMIT } from "../verification/retention";

export interface ImageHashes {
  full: string; // 16 hex chars
  crops: string[]; // centre crops at CROP_SCALES, same order
}

/** Centre crops kept as extra hashes, so an edge-cropped re-share still lands near its source (measured: a
 *  single 70% crop missed 75-80% crops at distance 12-14). */
export const CROP_SCALES = [0.9, 0.8, 0.75, 0.7, 0.6];

const toHex = (bits: string) => bits.match(/.{4}/g)!.map((b) => parseInt(b, 2).toString(16)).join("");
const toBits = (hex: string) => [...hex].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");

export async function imageHashes(bytes: Uint8Array): Promise<ImageHashes> {
  // Apply EXIF orientation first, then read the size of what we actually crop.
  const upright = await sharp(bytes, { limitInputPixels: DECODE_LIMIT, pages: 1 }).rotate().png().toBuffer();
  const { width: w = 1, height: h = 1 } = await sharp(upright).metadata();
  const crops: string[] = [];
  for (const s of CROP_SCALES) {
    const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    const c = await sharp(upright).extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch }).png().toBuffer();
    crops.push(toHex(await perceptualHash(new Uint8Array(c))));
  }
  return { full: toHex(await perceptualHash(bytes)), crops };
}

/** Smallest distance over all full/crop pairings, so a cropped copy still meets its source. */
export function hashDistance(a: ImageHashes, b: ImageHashes): number {
  const A = [a.full, ...a.crops].map(toBits), B = [b.full, ...b.crops].map(toBits);
  return Math.min(...A.flatMap((x) => B.map((y) => hammingDistance(x, y))));
}
