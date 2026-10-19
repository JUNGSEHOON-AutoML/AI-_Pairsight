import { CaseError } from "../model";
import { DESKS, type Desk } from "../desks";

export const REPORT_SECTIONS = ["접수 확인", "작업 결과", "자기 검증", "인계"] as const;
export interface ReportMeta {
  version: 1; caseId: string; desk: Desk; status: "pass" | "hold" | "stopped";
  evidenceIds: string[]; nextDesk: Desk | "editor" | null; durationMs: number;
  instructionHash: string; createdAt: string; author: "llm" | "legacy";
}
const invalid = () => new CaseError("report_invalid", "보고서 형식·근거 검사를 통과하지 못해 인계를 멈췄어요.");
/** JSON is a strict YAML subset: no YAML tags, aliases, duplicate keys or executable content. */
export function validateReport(markdown: string, expected: { caseId: string; desk: Desk; evidenceIds: string[] }): ReportMeta {
  if (markdown.length > 24000 || /<\/?[a-z]|data:|base64|!\[|```/i.test(markdown)) throw invalid();
  const match = /^---\n(\{[^\n]+\})\n---\n\n([\s\S]+)$/.exec(markdown);
  if (!match) throw invalid();
  let m: ReportMeta;
  try { m = JSON.parse(match[1]); } catch { throw invalid(); }
  const keys = ["version", "caseId", "desk", "status", "evidenceIds", "nextDesk", "durationMs", "instructionHash", "createdAt", "author"];
  if (!m || Object.keys(m).length !== keys.length || keys.some(k => !Object.hasOwn(m, k)) ||
      m.version !== 1 || m.caseId !== expected.caseId || m.desk !== expected.desk ||
      !["pass", "hold", "stopped"].includes(m.status) || !["llm", "legacy"].includes(m.author) ||
      !Number.isSafeInteger(m.durationMs) || m.durationMs < 0 || !/^[a-f0-9]{64}$/.test(m.instructionHash) ||
      !Number.isFinite(Date.parse(m.createdAt)) || !Array.isArray(m.evidenceIds) ||
      m.evidenceIds.some(id => typeof id !== "string" || !expected.evidenceIds.includes(id)) ||
      !(m.nextDesk === null || m.nextDesk === "editor" || DESKS.some(d => d.id === m.nextDesk))) throw invalid();
  const headings = [...match[2].matchAll(/^## (.+)$/gm)].map(x => x[1]);
  if (JSON.stringify(headings) !== JSON.stringify(REPORT_SECTIONS)) throw invalid();
  const bodies = match[2].split(/^## .+\n/gm).slice(1);
  if (bodies.some(body => !body.trim())) throw invalid();
  for (const cite of match[2].matchAll(/\[근거:([^\]]+)\]/g)) {
    if (cite[1].split(",").some(id => !m.evidenceIds.includes(id.trim()))) throw invalid();
  }
  return m;
}

export function renderReport(meta: ReportMeta, sections: Record<typeof REPORT_SECTIONS[number], string[]>): string {
  return `---\n${JSON.stringify(meta)}\n---\n\n` + REPORT_SECTIONS.map(h => `## ${h}\n${sections[h].map(s => `- ${s}`).join("\n")}\n`).join("\n");
}
