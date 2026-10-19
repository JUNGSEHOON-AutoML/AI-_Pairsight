import type { Evidence, SourceMatch } from "../domain";
import type { Providers } from "../providers";
import { ProviderError } from "../providers/types";
import type { Candidate, ClaimContext, NormalizedInput, Progress, VerificationFacts } from "./types";
import { selectDate } from "./dates";
import { excerpt, publicUrl, thumbnail } from "./retention";

export interface Collected {
  matches: SourceMatch[];
  evidence: Evidence[];
  verification: VerificationFacts;
  searchedProviders: string[];
}
const sameText = (a: string, b: string) => a.normalize("NFKC").replace(/\s+/g, " ").trim() === b.normalize("NFKC").replace(/\s+/g, " ").trim();
const idle: Progress = async () => {};

/** All original bytes/HTML remain in request memory. Only the explicit projection below can leave this function. */
export async function collectEvidence(input: NormalizedInput, p: Providers, signal: AbortSignal, progress: Progress = idle): Promise<Collected> {
  let comparisonComplete = true;
  const warnings: string[] = [], matches: SourceMatch[] = [], evidence: Evidence[] = [];
  await progress("source", "running");
  const factSearch = async () => {
    const lease = await p.temporaryImages.publish(input.image, signal);
    try { return await p.factCheck.search(lease.url, signal); }
    finally { await lease.revoke(); }
  };
  const [reverse, facts] = await Promise.allSettled([p.reverseSearch.search(input.image, signal), factSearch()]);
  signal.throwIfAborted();
  // Empty successful searches differ from failed services. A failed reverse search + empty fact search cannot establish absence.
  if (reverse.status === "rejected" && (facts.status === "rejected" || !facts.value.length)) {
    throw new ProviderError("provider_timeout", "candidate discovery unavailable");
  }
  if (reverse.status === "rejected") warnings.push("역이미지 검색을 완료하지 못했어요.");
  if (facts.status === "rejected") warnings.push("팩트체크 검색을 완료하지 못했어요.");
  const factChecks = facts.status === "fulfilled" ? facts.value.slice(0, 5).filter(f => publicUrl(f.url) && publicUrl(f.imageCandidateUrl)).map(f => ({
    url: publicUrl(f.url)!, imageCandidateUrl: publicUrl(f.imageCandidateUrl)!, publisher: excerpt(f.publisher),
    claim: excerpt(f.claim), rating: excerpt(f.rating), reviewedAt: f.reviewedAt,
    assessment: f.assessment, verified: false, claimComplete: [...f.claim].length <= 200,
  })) : [];
  const raw = [...(reverse.status === "fulfilled" ? reverse.value.candidates : []),
    ...factChecks.map(f => ({ url: f.imageCandidateUrl, provider: p.factCheck.name }))];
  const unique = new Map<string, Candidate>();
  for (const c of raw) {
    const url = publicUrl(c.url);
    if (url && !unique.has(url)) unique.set(url, { ...c, url });
  }
  if (unique.size > 5) warnings.push("요청당 후보 5개까지만 확인했어요.");
  await progress("source", "done");
  await progress("verification", "running");
  const verified = [];
  for (const candidate of [...unique.values()].slice(0, 5)) {
    try { verified.push(await p.candidates.verify(candidate, signal)); }
    catch { signal.throwIfAborted(); warnings.push("후보 페이지 하나를 확인하지 못했어요. 차단·권한·응답 상태에 따라 건너뛰었어요."); }
  }
  await progress("verification", "done");
  await progress("provenance", "running");
  let sceneRejected = 0;
  for (const v of verified) {
    for (const image of v.images) {
      let comparison;
      try { comparison = await p.images.compare(input.image.bytes, image.bytes, signal); }
      catch { signal.throwIfAborted(); comparisonComplete = false; warnings.push("후보 이미지 하나를 비교하지 못했어요."); continue; }
      if (comparison.sceneRejected) sceneRejected++;
      if (!comparison.matched) continue;
      const dates = selectDate(v.dates.map(d => ({ ...d, imageBound: d.imageBound && d.imageHash === comparison.referenceHash })));
      const match: SourceMatch = {
        url: v.article.url, pageTitle: null, // text is retained once, within the per-page 200-character budget
        imageUrl: "data:image/png;base64," + Buffer.from(await thumbnail(image.bytes)).toString("base64"),
        firstSeenAt: dates.selected?.value ?? null, firstSeenSource: dates.selected?.source ?? null,
        similarity: comparison.alignmentScore, isEarliest: false, diffRegions: comparison.diffRegions,
        provider: v.candidate.provider, verified: true, dates: dates.observations, dateDisputed: dates.disputed,
        excerpt: excerpt(v.article.excerpt), comparison,
      };
      matches.push(match);
      evidence.push({ kind: "image_comparison", outcome: comparison.diffRegions.length ? "supports_manipulated" : "neutral",
        strength: "medium", score: null, sourceUrl: match.url, provider: p.images.name,
        summary: comparison.diffRegions.length ? "정렬 후에도 차이 영역이 남아요. 이것만으로 조작을 확정하지 않아요." : "같은 이미지 후보를 확인했어요. 잘라내기·반전·색보정은 조작 판정과 구분해요.",
        details: { pHashDistance: comparison.pHashDistance, alignedDistance: comparison.alignedDistance, crop: comparison.crop, flip: comparison.flip, colorAdjusted: comparison.colorAdjusted } });
      for (const f of factChecks) {
        const review = v.article.review;
        f.verified ||= f.url === v.article.url && comparison.changedFraction < .02 && comparison.diffRegions.length === 0 && !!review && review.claimComplete && f.claimComplete &&
          sameText(f.claim, review.claim) && sameText(f.rating, review.rating) && sameText(f.publisher, review.publisher);
      }
      break; // at most one retained match/thumbnail per candidate page
    }
  }
  // A completed comparison that says "different scene" is a result, not a failure: verification stays complete.
  if (sceneRejected) warnings.push(`픽셀 배치는 비슷하지만 다른 장면으로 보이는 후보 ${sceneRejected}개는 원본 비교에서 뺐어요.`);
  matches.sort((a, b) => (a.firstSeenAt ?? "9999").localeCompare(b.firstSeenAt ?? "9999"));
  if (matches[0]) matches[0].isEarliest = true; // earliest among this request's verified candidates, never an original-author claim
  if (input.thumbnailOnly) warnings.push("보관된 썸네일로 재검사했어요. 원본 파일의 EXIF·C2PA는 다시 확인할 수 없어요.");
  else {
    try {
      const signals = await p.provenance.inspect(input.image, signal);
      evidence.push(...signals.map(e => e.kind === "pixel_model" ? { ...e, strength: "weak" as const } : e));
    } catch { signal.throwIfAborted(); warnings.push("파일 출처 기록을 확인하지 못했어요."); }
  }
  // One source excerpt includes the review claim; do not keep a second 200-char page extract for the same review.
  const sources = matches.map(m => ({ url: m.url, excerpt: m.excerpt ?? "" }));
  for (const f of factChecks) {
    const source = sources.find(s => s.url === f.url);
    const reviewExcerpt = excerpt(`${f.publisher} · ${f.rating} · ${f.claim}`);
    if (source) source.excerpt = reviewExcerpt;
    else sources.push({ url: f.url, excerpt: reviewExcerpt });
    // claim/rating/publisher are portions of this same <=200-character record; no independent full-text excerpts.
    let remaining = 200;
    for (const key of ["publisher", "rating", "claim"] as const) {
      if (key === "claim" && [...f[key]].length > Math.max(0, remaining - 3)) f.claimComplete = false;
      f[key] = [...f[key]].slice(0, Math.max(0, remaining - 3)).join(""); remaining -= [...f[key]].length + 3;
    }
  }
  for (const m of matches) m.excerpt = factChecks.some(f => f.url === m.url && !f.verified) ? "" : sources.find(s => s.url === m.url)?.excerpt ?? "";
  await progress("provenance", "done");
  return { matches, evidence, verification: { factChecks, sources, warnings: [...new Set(warnings)], discoveryComplete: reverse.status === "fulfilled" && facts.status === "fulfilled", verificationComplete: comparisonComplete && unique.size <= 5 && verified.length === unique.size && verified.every(v => v.images.length > 0) },
    searchedProviders: [...(reverse.status === "fulfilled" ? reverse.value.searchedProviders : []), p.factCheck.name] };
}

/** Claim-specific observations never enter a shared image analysis. Reject invented citations; cap LLM strength. */
export async function compareContext(claim: ClaimContext, data: Collected, p: Providers, signal: AbortSignal): Promise<Evidence[]> {
  const result: Evidence[] = [];
  for (const f of data.verification.factChecks) {
    const claimMatched = !!claim.text && f.claimComplete === true && sameText(claim.text, f.claim);
    const supports = f.verified && claimMatched && f.assessment === "miscontextualized";
    result.push({ kind: "fact_check", strength: supports ? "strong" : "medium", outcome: supports ? "supports_manipulated" : "neutral",
      score: null, provider: p.factCheck.name, sourceUrl: f.url,
      summary: supports ? "같은 이미지와 같은 주장에 대한 팩트체크 원문을 확인했어요." : "관련 팩트체크가 있어요. 현재 주장과의 일치가 확인되지 않아 판정에 사용하지 않아요.",
      details: { claimMatched, imageMatched: f.verified, pageVerified: f.verified, assessment: f.assessment } });
  }
  try {
    // Only fetched, image-matched pages are sent to the context provider, not unverified API snippets.
    const sources = data.verification.sources.filter(s => data.matches.some(m => m.url === s.url) && !data.verification.factChecks.some(f => f.url === s.url && !f.verified));
    const observations = await p.context.compare({ claim, sources, factChecks: data.verification.factChecks.filter(f => f.verified) }, signal);
    for (const o of observations.slice(0, 6)) {
      const source = sources.find(s => s.url === o.sourceUrl);
      if (!source || !o.quote || !source.excerpt.includes(o.quote) || !["date", "place", "event"].includes(o.dimension) || !["match", "mismatch", "unknown"].includes(o.relation)) continue;
      result.push({ kind: "context", strength: o.strength === "weak" ? "weak" : "medium", outcome: o.relation === "mismatch" ? "supports_manipulated" : "neutral",
        score: null, sourceUrl: source.url, provider: p.context.name, summary: excerpt(o.explanation),
        details: { dimension: o.dimension, relation: o.relation, quote: excerpt(o.quote) } });
    }
  } catch {
    result.push({ kind: "context", strength: "weak", outcome: "unavailable", score: null, sourceUrl: null, provider: p.context.name,
      summary: "맥락 비교를 완료하지 못했어요. 다른 검증된 근거만 사용해요.", details: {} });
  }
  return result;
}
