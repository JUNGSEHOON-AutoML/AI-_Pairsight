import { CaseError, type CaseInput } from "./model";
import { CHANNELS, TOPICS, type ContentFlag } from "../public/types";
import { publicUrl, hash, thumbnail, excerpt } from "../verification/retention";
import { assertFetchableUrl } from "../net/ssrf";
import { LocalMetadataProvider } from "../verification/adapters";
const flags: ContentFlag[] = ["sexual_content", "minor", "private_person", "graphic_violence", "election_period"];
function url(raw: FormDataEntryValue | null): string | null {
  if (!raw) return null;
  if (typeof raw !== "string" || raw.length > 2048) throw new CaseError("invalid_url", "공개 페이지 URL을 확인해 주세요.");
  const safe = publicUrl(raw.trim());
  if (!safe) throw new CaseError("invalid_url", "로그인 토큰이 없는 공개 페이지 URL만 사용할 수 있어요.");
  try { assertFetchableUrl(safe); } catch { throw new CaseError("invalid_url", "외부 공개 주소만 접수할 수 있어요."); }
  return safe;
}
export async function intake(form: FormData, operatorId: string): Promise<CaseInput> {
  const claim = String(form.get("claim") ?? "").trim();
  if (!claim || [...claim].length > 200) throw new CaseError("invalid_claim", "확인할 주장을 200자 이내로 적어 주세요.");
  const pageUrl = url(form.get("pageUrl")), imageUrl = url(form.get("imageUrl"));
  const candidateUrls = [...new Set(String(form.get("candidateUrls") ?? "").split(/\r?\n/).filter(Boolean).map(u => url(u)!))];
  if (candidateUrls.length > 5) throw new CaseError("candidate_limit", "후보 링크는 최대 5개입니다.");
  const contentFlags = form.getAll("flags").map(String).filter((f): f is ContentFlag => flags.includes(f as ContentFlag));
  const file = form.get("image");
  if (!pageUrl && !(file instanceof File && file.size)) throw new CaseError("missing_input", "이미지 또는 기사 URL을 넣어 주세요.");
  if (imageUrl && !pageUrl) throw new CaseError("invalid_url", "이미지 주소는 제출한 기사에 포함된 주소여야 해요.");
  const claimedDate = String(form.get("claimedDate") ?? "") || null;
  if (claimedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(claimedDate) || !Number.isFinite(Date.parse(claimedDate)) || new Date(claimedDate).toISOString().slice(0,10) !== claimedDate || claimedDate > new Date().toISOString().slice(0,10))) throw new CaseError("invalid_date", "주장 날짜를 확인해 주세요.");
  const input: CaseInput = { origin: "manual", claim, claimedDate, pageUrl, imageUrl, candidateUrls, thumbnail: null, imageHash: null, provenance: [],
    topic: TOPICS.find(t => t.id === form.get("topic"))?.id ?? null, channels: form.getAll("channels").map(String).filter((s): s is CaseInput["channels"][number] => CHANNELS.some(c => c.id === s)),
    contentFlags, externalSearchAllowed: form.get("externalSearch") === "yes", rightsConfirmed: form.get("rights") === "yes", reportedBy: operatorId };
  if (file instanceof File && file.size && !contentFlags.includes("sexual_content")) {
    if (file.size > 10 * 1024 * 1024 || !/^image\/(png|jpeg|webp|heic|heif)$/.test(file.type)) throw new CaseError("invalid_image", "10MB 이하 지원 이미지 파일이 필요해요.");
    try {
      const b = new Uint8Array(await file.arrayBuffer()), sha256 = hash(b);
      input.thumbnail = "data:image/png;base64," + Buffer.from(await thumbnail(b)).toString("base64");
      input.imageHash = sha256;
      input.provenance = await new LocalMetadataProvider().inspect({ bytes: b, mime: file.type, sha256, publicUrl: null }, AbortSignal.timeout(10_000));
    } catch { throw new CaseError("invalid_image", "이미지를 안전하게 읽지 못했어요. 원본 파일은 저장하지 않았어요."); }
  }
  if (contentFlags.includes("sexual_content")) { input.imageUrl = null; input.rightsConfirmed = false; }
  input.claim = excerpt(input.claim);
  return input;
}
export async function boundedRequest(req: Request, max = 11 * 1024 * 1024) {
  const reader = req.body?.getReader();
  if (!reader) throw new CaseError("empty_body", "입력이 없어요.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length;
    if (length > max) { await reader.cancel(); throw new CaseError("body_limit", "요청 크기 제한을 초과했어요."); } chunks.push(value); }
  return new Request(req.url, { method: "POST", headers: { "content-type": req.headers.get("content-type") ?? "application/json" }, body: Buffer.concat(chunks) });
}
