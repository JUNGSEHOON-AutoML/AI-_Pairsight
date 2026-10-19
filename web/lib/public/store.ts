import { caseRepository } from "../newsroom/repository";
import { publicProjection } from "../newsroom/review";
import type { Verdict } from "../domain";
import { publishProblems, type Channel, type PublicCase, type Topic } from "./types";

const live = () => caseRepository().list().map(publicProjection).filter((c): c is PublicCase => c !== null && !c.example);

export interface CaseFilter {
  topic?: Topic | null;
  verdict?: Verdict | null;
  channel?: Channel | null;
}

export function listPublicCases(f: CaseFilter = {}, source: PublicCase[] = live()): PublicCase[] {
  return source
    .filter((c) => publishProblems(c).length === 0)
    .filter((c) => !f.topic || c.topic === f.topic)
    .filter((c) => !f.verdict || c.verdict === f.verdict)
    .filter((c) => !f.channel || c.channels.includes(f.channel))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export function getPublicCase(slug: string, source: PublicCase[] = live()): PublicCase | null {
  const c = source.find((x) => x.slug === slug);
  return c && publishProblems(c).length === 0 ? c : null;
}
