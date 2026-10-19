import type { Evidence, SourceMatch, StepId } from "../domain";
import type { FetchedImage, ImageInput, PageImage } from "../providers/types";
import type { VerdictInput, VerdictResult } from "../verdict";

export type DateSource = "page_meta" | "wayback_first_capture" | "search_discovered";
export interface DateRecord {
  value: string;
  source: DateSource;
  sourceUrl: string;
  confidence: "medium" | "weak";
  meaning: "publication_claim" | "page_capture" | "image_discovery";
  imageHash?: string; // hash of the image actually verified in the historical capture
  imageBound: boolean; // A page's age alone does not date an image subsequently added to it.
}
export interface Candidate {
  url: string;
  provider: string;
  discoveredAt?: string;
  imageUrl?: string;
}
export interface Article {
  url: string;
  title: string;
  excerpt: string; // all retained source text, <= 200 Unicode code points per page
  images: (PageImage & { role: "representative" | "body"; caption: string })[];
  dates: DateRecord[];
  review?: { claim: string; rating: string; publisher: string; claimComplete: boolean };
}
export interface RawInput {
  bytes: Uint8Array;
  mime: string;
  pageUrl: string | null;
  publicImageUrl: string | null;
  thumbnailOnly?: boolean;
}
export interface NormalizedInput {
  image: ImageInput;
  thumbnail: FetchedImage;
  article: Article | null;
  thumbnailOnly: boolean;
}
export interface InputProvider {
  readonly name: string;
  normalize(input: RawInput, signal: AbortSignal): Promise<NormalizedInput>;
}
export interface TemporaryImageLease {
  url: string;
  expiresAt: string;
  revoke(): Promise<void>;
}
export interface TemporaryImageProvider {
  readonly name: string;
  publish(image: ImageInput, signal: AbortSignal): Promise<TemporaryImageLease>;
}
export interface FactCheckRecord {
  url: string;
  publisher: string;
  claim: string;
  rating: string; // never normalize an arbitrary publisher rating into false automatically
  reviewedAt: string | null;
  imageCandidateUrl: string;
  assessment: "miscontextualized" | "unknown";
  verified: boolean;
  claimComplete?: boolean;
}
export interface FactCheckProvider {
  readonly name: string;
  search(imageUri: string, signal: AbortSignal): Promise<FactCheckRecord[]>;
}
export interface PageFetchProvider {
  readonly name: string;
  page(url: string, signal: AbortSignal): Promise<Article>;
  image(url: string, signal: AbortSignal): Promise<FetchedImage>;
}
export interface ArchiveDateProvider {
  readonly name: string;
  firstCapture(url: string, signal: AbortSignal): Promise<DateRecord | null>;
}
export interface VerifiedCandidate {
  candidate: Candidate;
  article: Article;
  dates: DateRecord[];
  images: { url: string; bytes: Uint8Array; mime: string }[]; // request memory only
}
export interface CandidateVerificationProvider {
  readonly name: string;
  verify(candidate: Candidate, signal: AbortSignal): Promise<VerifiedCandidate>;
}
export interface ComparisonResult {
  matched: boolean;
  /** Embedding similarity, computed only when pixel alignment passed; an exclusion gate, never evidence. */
  sceneSimilarity: number | null;
  sceneRejected: boolean; // aligned by pixels, but the scene gate says it is a different scene

  pHashDistance: number;
  alignedDistance: number;
  alignmentScore: number;
  changedFraction: number;
  /** Mean absolute RGB residual (0..1) outside ALL difference boxes; null if no samples remain. */
  outsideResidual: number | null;
  /** Sum of all region bounding-box areas, before the UI's eight-region display limit. */
  diffAreaFraction: number;
  diffRegionCount: number;
  crop: { x: number; y: number; w: number; h: number } | null;
  flip: "horizontal" | "vertical" | null;
  colorAdjusted: boolean;
  diffRegions: SourceMatch["diffRegions"];
  heatmap: string; // small PNG data URL, never a high-resolution original
  referenceHash: string;
}
export interface ImageComparisonProvider {
  readonly name: string;
  compare(input: Uint8Array, reference: Uint8Array, signal: AbortSignal): Promise<ComparisonResult>;
}
export interface ProvenanceProvider {
  readonly name: string;
  inspect(image: ImageInput, signal: AbortSignal): Promise<Evidence[]>;
}
export interface ClaimContext { text: string; date: string | null }
export interface ContextInput {
  claim: ClaimContext;
  sources: { url: string; excerpt: string }[];
  factChecks: FactCheckRecord[];
}
export interface ContextObservation {
  dimension: "date" | "place" | "event";
  relation: "mismatch" | "match" | "unknown";
  sourceUrl: string;
  quote: string;
  explanation: string;
  strength: "medium" | "weak";
}
export interface ContextComparisonProvider {
  readonly name: string;
  compare(input: ContextInput, signal: AbortSignal): Promise<ContextObservation[]>;
}
export interface VerdictProvider {
  readonly name: string;
  decide(input: VerdictInput): VerdictResult;
}
export interface VerificationFacts {
  factChecks: FactCheckRecord[];
  sources: { url: string; excerpt: string }[];
  warnings: string[];
  discoveryComplete?: boolean;
  verificationComplete?: boolean;
}
export type Progress = (step: StepId, state: "running" | "done") => Promise<void>;
