import type { InputProvider, RawInput, Candidate, CandidateVerificationProvider, PageFetchProvider, ArchiveDateProvider, ProvenanceProvider } from "./types";
import type { ImageInput } from "../providers/types";
import { ProviderError } from "../providers/types";
import { excerpt, hash, thumbnail } from "./retention";
import sharp from "sharp";
import { DECODE_LIMIT } from "./retention";
import type { Evidence } from "../domain";

export class NormalizingInputProvider implements InputProvider {
  readonly name = "bounded-input";
  constructor(private pages: PageFetchProvider) {}
  async normalize(input: RawInput, signal: AbortSignal) {
    signal.throwIfAborted();
    // The selected image must be on the one submitted article, not an arbitrary second page.
    const article = !input.thumbnailOnly && input.pageUrl && input.pageUrl !== input.publicImageUrl ? await this.pages.page(input.pageUrl, signal) : null;
    if (article && !article.images.some(i => i.url === input.publicImageUrl)) throw new ProviderError("url_blocked", "image not on submitted page");
    const thumb = await thumbnail(input.bytes);
    return { image: { bytes: input.bytes, mime: input.mime, sha256: hash(input.bytes), publicUrl: input.publicImageUrl },
      thumbnail: { bytes: thumb, mime: "image/png" }, article, thumbnailOnly: input.thumbnailOnly ?? false };
  }
}

export class OnDemandCandidateVerifier implements CandidateVerificationProvider {
  readonly name = "bounded-candidate-verifier";
  constructor(private pages: PageFetchProvider, private archive: ArchiveDateProvider) {}
  async verify(candidate: Candidate, signal: AbortSignal) {
    const article = await this.pages.page(candidate.url, signal);
    const archiveDate = await this.archive.firstCapture(article.url, signal).catch(() => { signal.throwIfAborted(); return null; });
    const dates = [...article.dates, ...(archiveDate ? [archiveDate] : [])];
    if (candidate.discoveredAt) dates.push({ value: candidate.discoveredAt, source: "search_discovered", confidence: "weak",
      sourceUrl: candidate.url, meaning: "image_discovery", imageBound: false });
    const selected = [...article.images].sort((a, b) => Number(b.url === candidate.imageUrl) - Number(a.url === candidate.imageUrl)).slice(0, 2);
    const images = [];
    for (const item of selected) {
      try { images.push({ url: item.url, ...await this.pages.image(item.url, signal) }); }
      catch (e) { if (signal.aborted) throw e; }
    }
    return { candidate, article: { ...article, title: excerpt(article.title), excerpt: excerpt(article.excerpt) }, dates, images };
  }
}

/** EXIF presence is factual but weak. No raw EXIF/GPS is retained; real C2PA verification is an adapter task. */
export class LocalMetadataProvider implements ProvenanceProvider {
  readonly name = "local-metadata";
  async inspect(image: ImageInput, signal: AbortSignal): Promise<Evidence[]> {
    signal.throwIfAborted();
    const metadata = await sharp(image.bytes, { limitInputPixels: DECODE_LIMIT, pages: 1 }).metadata();
    return [{ kind: "exif", outcome: "neutral", strength: "weak", score: null, provider: this.name, sourceUrl: null,
      details: { present: Boolean(metadata.exif) }, summary: metadata.exif ? "EXIF 정보가 있어요. 촬영 사실을 증명하지는 않아요." : "EXIF 정보가 없어요. 삭제되었을 수도 있어요." }];
  }
}
