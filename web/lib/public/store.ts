// Public cases, read side. Memory-backed by data/public-cases.json for now (fictional examples built by
// scripts/make-public-seed.ts); with Supabase this becomes a select on public_cases, where RLS returns approved
// rows only. The same rule is applied here so nothing unapproved can reach a page in either mode.
import seed from "../../data/public-cases.json";
import type { Verdict } from "../domain";
import { publishProblems, type Channel, type PublicCase, type Topic } from "./types";

const all = seed as unknown as PublicCase[];

export interface CaseFilter {
  topic?: Topic | null;
  verdict?: Verdict | null;
  channel?: Channel | null;
}

export function listPublicCases(f: CaseFilter = {}, source: PublicCase[] = all): PublicCase[] {
  return source
    .filter((c) => publishProblems(c).length === 0)
    .filter((c) => !f.topic || c.topic === f.topic)
    .filter((c) => !f.verdict || c.verdict === f.verdict)
    .filter((c) => !f.channel || c.channels.includes(f.channel))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export function getPublicCase(slug: string, source: PublicCase[] = all): PublicCase | null {
  const c = source.find((x) => x.slug === slug);
  return c && publishProblems(c).length === 0 ? c : null;
}

export const allCasesForTests = () => all;
