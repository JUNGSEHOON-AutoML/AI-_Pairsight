"use client";
// S03 result. Order (components.md §2): verdict + one-line reason → evidence cards (strongest first)
// → compare (or 원본 없음) → 상세 점수 (collapsed) → disclaimer.
// 판단 불가 uses the four-block layout from components.md §1: checked / found / missing / what you can do.
import { Bell, Check as CheckIcon, ChevronDown, RefreshCw, SearchX, Share2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COPY, EVIDENCE_LABEL, OUTCOME_LABEL } from "@/lib/domain";
import type { CheckView } from "@/lib/view";
import { CompareView } from "./compare-view";
import { QuotaExhausted } from "./status-panels";
import { Block, Button, ButtonLink, Panel } from "./ui";
import { CheckedAt, EvidenceCard, VerdictBanner } from "./verdict";

function RecheckButton({ id, onQuota }: { id: string; onQuota: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/checks/${id}/recheck`, { method: "POST" });
          if (res.status === 429) onQuota();
          else if (res.ok) router.push(`/check/${(await res.json()).id}`);
          else setError("재검사를 시작하지 못했어요.");
          setBusy(false);
        }}
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        재검사 <span className="font-normal">(무료 횟수 1회)</span>
      </Button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </span>
  );
}

export function NoSourceBlock({ view }: { view: CheckView }) {
  return (
    <section aria-labelledby="nosource-title" className="rounded-md bg-surface p-4 md:p-5">
      <h3 id="nosource-title" className="flex items-center gap-2 font-semibold">
        <SearchX aria-hidden="true" className="size-5" />
        {COPY.noSourceTitle}
      </h3>
      <p className="mt-1">{COPY.noSourceBody}</p>
      <p className="mt-3 text-sm text-text-muted">이런 경우에 원본이 안 나올 수 있어요</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        <li>방금 찍었거나 처음 올라온 사진</li>
        <li>비공개 계정, 단톡방, 카페처럼 검색되지 않는 곳에만 있는 사진</li>
        <li>많이 잘리거나 필터를 입힌 사진</li>
      </ul>
      {view.searchedProviders.length > 0 && (
        <p className="mt-3 text-sm text-text-muted">검색한 곳: {view.searchedProviders.join(" · ")}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href="/" variant="secondary" size="sm">
          <Upload aria-hidden="true" className="size-4" />
          잘리지 않은 원본으로 다시 검사
        </ButtonLink>
      </div>
    </section>
  );
}

function CheckedItems({ view }: { view: CheckView }) {
  const exact = view.matches.filter((m) => m.similarity >= 0.98).length;
  const similar = view.matches.length - exact;
  const sourceResult =
    view.matches.length === 0 ? "같은 사진 0건" : exact > 0 ? `같은 사진 ${exact}건` : `비슷한 사진 ${similar}건 (같은 사진 0건)`;
  const rows: [string, string][] = [
    [`원본 검색${view.searchedProviders.length ? ` (${view.searchedProviders.join(" · ")})` : ""}`, sourceResult],
    ...view.evidence
      .filter((e) => e.kind !== "source_match")
      .map((e): [string, string] => [EVIDENCE_LABEL[e.kind], e.kind === "pixel_model" ? "완료 (참고용)" : OUTCOME_LABEL[e.outcome]]),
  ];
  return (
    <ul className="grid gap-1.5 text-sm">
      {rows.map(([label, result]) => (
        <li key={label} className="grid grid-cols-[20px_1fr_auto] items-center gap-2">
          <CheckIcon aria-hidden="true" className="size-4 text-verdict-real" />
          <span>{label}</span>
          <span className="text-right text-text-muted">{result}</span>
        </li>
      ))}
    </ul>
  );
}

function Details({ view }: { view: CheckView }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold">
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        상세 점수
      </summary>
      <table className="mt-2 w-full border-collapse text-left">
        <caption className="sr-only">근거별 원래 값</caption>
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th scope="col" className="py-1 font-normal">근거</th>
            <th scope="col" className="py-1 font-normal">점수</th>
            <th scope="col" className="py-1 font-normal">제공자</th>
          </tr>
        </thead>
        <tbody>
          {view.evidence.map((e) => (
            <tr key={`${e.kind}-${e.provider}`} className="border-b border-border">
              <td className="py-1">{EVIDENCE_LABEL[e.kind]}</td>
              <td className="py-1">{e.score == null ? "—" : e.score.toFixed(1)}</td>
              <td className="py-1">{e.provider}</td>
            </tr>
          ))}
          {view.matches.map((m) => (
            <tr key={m.url} className="border-b border-border">
              <td className="py-1">원본 유사도</td>
              <td className="py-1">{(m.similarity * 100).toFixed(1)}</td>
              <td className="py-1">{m.provider}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-text-muted">
        판정 규칙 v{view.pipelineVersion} · 분석 {view.analysisId.slice(0, 8)}
        {view.claimedDate && ` · 알려준 사건 날짜 ${view.claimedDate}`}
      </p>
    </details>
  );
}

export function ResultView({ view }: { view: CheckView }) {
  const [quotaHit, setQuotaHit] = useState(false);
  if (!view.verdict || !view.reason) return null;
  const inconclusive = view.verdict === "inconclusive";
  const earliest = view.matches.find((m) => m.isEarliest) ?? view.matches[0];

  const banner = (
    <VerdictBanner verdict={view.verdict} reason={view.reason}>
      <CheckedAt at={view.checkedAt}>
        <RecheckButton id={view.id} onQuota={() => setQuotaHit(true)} />
      </CheckedAt>
    </VerdictBanner>
  );
  const compare = earliest ? (
    <CompareView match={earliest} uploadedUrl={view.imageUrl} />
  ) : (
    <NoSourceBlock view={view} />
  );
  const disclaimer = (
    <div className="text-sm text-text-muted">
      <p>{COPY.disclaimer}</p>
      {view.inputType === "url" && <p className="mt-1">{COPY.urlScope}</p>}
    </div>
  );

  return (
    <div className="grid gap-4">
      {quotaHit && <QuotaExhausted />}
      {inconclusive ? (
        <Panel aria-label="판단 불가 결과">
          <Block className="!p-0">{banner}</Block>
          <Block title="확인한 항목">
            <CheckedItems view={view} />
          </Block>
          <Block title="찾은 것">
            {view.evidence.length === 0 ? (
              <p className="text-sm">판정에 쓸 만한 근거를 찾지 못했어요.</p>
            ) : (
              <div className="grid gap-3">
                {view.evidence.map((e) => (
                  <EvidenceCard key={`${e.kind}-${e.provider}`} e={e} />
                ))}
              </div>
            )}
          </Block>
          <Block title="부족한 근거">
            <ul className="list-disc pl-5 text-sm">
              {view.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Block>
          <Block title="할 수 있는 일">
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/" size="md">
                <Upload aria-hidden="true" className="size-4" />
                원본 파일로 다시 검사
              </ButtonLink>
              <Button variant="secondary" disabled title="알림은 다음 단계에서 만들어요">
                <Bell aria-hidden="true" className="size-4" />
                며칠 뒤 재검사 알림 (준비 중)
              </Button>
              <Button variant="ghost" disabled title="공유 링크는 다음 단계에서 만들어요">
                <Share2 aria-hidden="true" className="size-4" />
                공유해서 출처 묻기 (준비 중)
              </Button>
            </div>
          </Block>
          <Block>{compare}</Block>
          <Block>
            <Details view={view} />
          </Block>
          <Block>{disclaimer}</Block>
        </Panel>
      ) : (
        <>
          {banner}
          <section aria-labelledby="evidence-title" className="grid gap-3">
            <h3 id="evidence-title" className="text-base font-semibold">
              근거
            </h3>
            {view.evidence.map((e) => (
              <EvidenceCard key={`${e.kind}-${e.provider}`} e={e} />
            ))}
          </section>
          {compare}
          <Details view={view} />
          {disclaimer}
        </>
      )}
    </div>
  );
}
