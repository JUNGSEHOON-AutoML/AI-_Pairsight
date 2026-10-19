import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardList, CaseHero, CourtTimeline } from "@/components/public-cases";
import { getPublicCase } from "@/lib/public/store";

async function CaseDetail({ params }: { params: PageProps<"/cases/[slug]">["params"] }) {
  const { slug } = await params;
  const c = getPublicCase(slug); // approved cases only; anything else is a 404
  if (!c) notFound();
  return (
    <article className="grid gap-8">
      <p className="text-sm"><Link href="/cases">← 공개 사례</Link></p>
      <CaseHero c={c} />
      <section aria-labelledby="court-title" className="grid gap-2">
        <h2 id="court-title" className="text-lg">공방 기록</h2>
        <p className="text-sm text-text-muted">
          판정은 코드(규칙 v3)가 정해요. 에이전트는 아래 근거 카드를 인용한 주장만 할 수 있고, 배심원은 근거 있는 의심이 있을 때 판단
          불가로 낮추는 것만 할 수 있어요.
        </p>
        <CourtTimeline c={c} />
      </section>
      <section aria-labelledby="cards-title" className="grid gap-2">
        <h2 id="cards-title" className="text-lg">근거 카드</h2>
        <CardList c={c} />
      </section>
      {c.example && <p className="text-sm text-text-muted">이 사례는 합성 예시 이미지와 가상의 페이지로 만든 시연용이에요. 실제 사건이 아니에요.</p>}
    </article>
  );
}

export default function CasePage({ params }: PageProps<"/cases/[slug]">) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-60 animate-pulse rounded-lg bg-surface" />}>
      <CaseDetail params={params} />
    </Suspense>
  );
}
