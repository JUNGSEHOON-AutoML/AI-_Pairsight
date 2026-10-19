import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { CaseCard, FilterBar, TopicNav, type Filters } from "@/components/public-cases";
import { VERDICTS, type Verdict } from "@/lib/domain";
import { listPublicCases } from "@/lib/public/store";
import { CHANNELS, TOPICS, topicLabel, type Channel, type Topic } from "@/lib/public/types";

export const metadata = { title: "공개 사례 · Pairsight" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
function parse(sp: Record<string, string | string[] | undefined>): Filters {
  const topic = one(sp.topic), verdict = one(sp.verdict), channel = one(sp.channel);
  return {
    topic: TOPICS.some((t) => t.id === topic) ? (topic as Topic) : null,
    verdict: (VERDICTS as readonly string[]).includes(verdict ?? "") ? (verdict as Verdict) : null,
    channel: CHANNELS.some((c) => c.id === channel) ? (channel as Channel) : null,
  };
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/cases">["searchParams"] }) {
  const filters = parse(await searchParams);
  await connection();
  const cases = listPublicCases(filters);
  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
      <TopicNav filters={filters} />
      <div className="grid content-start gap-6">
        <div className="grid gap-2">
          <h1 className="text-xl">{filters.topic ? topicLabel(filters.topic) : "공개 사례"}</h1>
          <p className="text-sm text-text-muted">
            운영자가 검토하고 승인한 결과만 보여줘요. 제목은 사실 문장이고, 가짜이거나 확인되지 않은 이미지는 흐리게 보여줘요. 유포 경로는
            제보로 받은 정보이고, 플랫폼에서 수집하지 않아요.
          </p>
          <Link href="/how-it-works" className="w-fit text-sm">선정·게재 기준 보기</Link>
        </div>
        <FilterBar filters={filters} />
        <p className="text-sm" aria-live="polite">사례 {cases.length}건</p>
        {cases.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => (
              <li key={c.id}><CaseCard c={c} /></li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-surface p-4 text-sm">조건에 맞는 공개 사례가 없어요. 필터를 바꿔 보세요.</p>
        )}
      </div>
    </div>
  );
}

export default function CasesPage({ searchParams }: PageProps<"/cases">) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-60 animate-pulse rounded-lg bg-surface" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
