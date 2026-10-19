// Public dashboard pieces (replica/public-dashboard.md): topic menu (sidebar ≥ md, tabs below), filters, case
// cards with blurred pictures, and the 2D court timeline. Server components; only the blur toggle is a client part.
import Link from "next/link";
import { Gavel, Scale, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { VERDICT_LABEL, type Verdict } from "@/lib/domain";
import { DOUBT_LABEL } from "@/lib/court/prompts";
import { CHANNELS, FILTER_VERDICTS, TOPICS, channelLabel, isBlurred, topicLabel, type Channel, type PublicCase, type Topic } from "@/lib/public/types";
import { BlurredImage } from "./blurred-image";
import { cx } from "./ui";
import { VERDICT_STYLE, VerdictLabel } from "./verdict";

export interface Filters { topic: Topic | null; verdict: Verdict | null; channel: Channel | null }

export function casesHref(f: Filters, patch: Partial<Filters>) {
  const next = { ...f, ...patch };
  const q = new URLSearchParams();
  if (next.topic) q.set("topic", next.topic);
  if (next.verdict) q.set("verdict", next.verdict);
  if (next.channel) q.set("channel", next.channel);
  const s = q.toString();
  return s ? `/cases?${s}` : "/cases";
}

const topicItems = [{ id: null, label: "전체" }, ...TOPICS] as { id: Topic | null; label: string }[];

/** Left menu on wide screens; a scrollable tab row on phones (390px). Same links, same current state. */
export function TopicNav({ filters }: { filters: Filters }) {
  return (
    <>
      <nav aria-label="주제" className="hidden md:block">
        <ul className="sticky top-4 grid gap-1">
          {topicItems.map((t) => (
            <li key={t.id ?? "all"}>
              <Link
                href={casesHref(filters, { topic: t.id })}
                aria-current={filters.topic === t.id ? "page" : undefined}
                className={cx(
                  "block rounded-md px-3 py-2 text-sm no-underline",
                  filters.topic === t.id ? "bg-surface font-semibold text-text" : "text-text-muted hover:bg-surface",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="주제" className="-mx-4 overflow-x-auto px-4 md:hidden">
        <ul className="flex w-max gap-1 border-b border-border">
          {topicItems.map((t) => (
            <li key={t.id ?? "all"}>
              <Link
                href={casesHref(filters, { topic: t.id })}
                aria-current={filters.topic === t.id ? "page" : undefined}
                className={cx(
                  "-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm no-underline",
                  filters.topic === t.id ? "border-accent font-semibold text-text" : "border-transparent text-text-muted",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function Chip({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "true" : undefined}
        className={cx(
          "inline-flex min-h-9 items-center rounded-pill border px-3 text-sm no-underline",
          current ? "border-accent bg-surface font-semibold text-text" : "border-border-input text-text-muted hover:bg-surface",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

export function FilterBar({ filters }: { filters: Filters }) {
  return (
    <div className="grid gap-3">
      <div>
        <h2 id="filter-verdict" className="mb-1 text-sm font-semibold">조작 유형</h2>
        <ul aria-labelledby="filter-verdict" className="flex flex-wrap gap-2">
          <Chip href={casesHref(filters, { verdict: null })} current={!filters.verdict}>전체</Chip>
          {FILTER_VERDICTS.map((v) => (
            <Chip key={v} href={casesHref(filters, { verdict: v })} current={filters.verdict === v}>{VERDICT_LABEL[v]}</Chip>
          ))}
        </ul>
      </div>
      <div>
        <h2 id="filter-channel" className="mb-1 text-sm font-semibold">유포 경로 <span className="font-normal text-text-muted">(제보 기준)</span></h2>
        <ul aria-labelledby="filter-channel" className="flex flex-wrap gap-2">
          <Chip href={casesHref(filters, { channel: null })} current={!filters.channel}>전체</Chip>
          {CHANNELS.map((c) => (
            <Chip key={c.id} href={casesHref(filters, { channel: c.id })} current={filters.channel === c.id}>{c.label}</Chip>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CaseCard({ c }: { c: PublicCase }) {
  const s = VERDICT_STYLE[c.verdict];
  return (
    <article className={cx("overflow-hidden rounded-lg border bg-bg", s.border)}>
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        {c.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static fixture thumbnails
          <img src={c.imagePath} alt={isBlurred(c.verdict) ? `흐림 처리된 이미지: ${c.imageAlt}` : c.imageAlt}
            className={cx("size-full object-cover", isBlurred(c.verdict) && "scale-110 blur-lg")} />
        ) : (
          <p className="grid size-full place-items-center p-4 text-center text-sm text-text-muted">이미지 없이 게재한 사례예요</p>
        )}
        <span className={cx("absolute left-2 top-2 rounded-pill border px-2 py-1 text-sm", s.bg, s.border)}>
          <VerdictLabel verdict={c.verdict} />
        </span>
      </div>
      <div className="grid gap-2 p-4">
        <h3 className="text-base leading-snug">
          <Link href={`/cases/${c.slug}`} className="text-text no-underline hover:underline">{c.truthTitle}</Link>
        </h3>
        <p className="text-sm text-text-muted">
          {topicLabel(c.topic)} · {c.channels.map(channelLabel).join(", ")}
          {c.example && <> · <span className="font-semibold">가상의 예시</span></>}
        </p>
      </div>
    </article>
  );
}

const cite = (ids: string[]) => (
  <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
    {ids.map((id) => (
      <a key={id} href={`#card-${id}`} className="rounded-sm border border-border-input px-1.5 font-mono text-xs no-underline">
        {id}
      </a>
    ))}
  </span>
);

function Step({ icon: Icon, title, children, last }: { icon: typeof Gavel; title: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[2rem_1fr] gap-3 pb-6">
      {!last && <span aria-hidden="true" className="absolute left-4 top-9 h-[calc(100%-2.5rem)] border-l-2 border-border" />}
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-pill border border-border bg-surface">
        <Icon className="size-4" />
      </span>
      <div>
        <h3 className="text-base">{title}</h3>
        <div className="mt-1 grid gap-2 text-sm">{children}</div>
      </div>
    </li>
  );
}

/** 검사 → 변호인 → 배심원 의심 → 판결, every statement with its evidence-card citations. */
export function CourtTimeline({ c }: { c: PublicCase }) {
  const r = c.court;
  const rejectedOf = (prefix: string) => r.rejected.filter((x) => x.role.startsWith(prefix));
  const note = (prefix: string) => {
    const xs = rejectedOf(prefix);
    return xs.length ? (
      <p className="text-text-muted">규칙에 따라 폐기된 주장 {xs.length}건: {[...new Set(xs.map((x) => x.reason.replace(/ 유지로 처리했어요\.$/, "")))].join(" / ")}</p>
    ) : null;
  };
  return (
    <ol aria-label="공방 기록" className="mt-2">
      <Step icon={Scale} title={`판사 (규칙 v3, 코드): ${VERDICT_LABEL[r.judgeVerdict]}`}>
        <p>{r.judgeReason}</p>
        {!r.opened && <p className="text-text-muted">판사가 결론을 내리지 않아 공방을 열지 않았어요.</p>}
      </Step>
      {r.opened && (
        <>
          <Step icon={ShieldAlert} title="검사: 조작이라는 근거">
            {r.prosecution.length ? r.prosecution.map((a) => <p key={a.id}>{a.text}{cite(a.cite)}</p>) : <p className="text-text-muted">근거 카드를 인용한 주장이 없었어요.</p>}
            {note("검사")}
          </Step>
          <Step icon={ShieldCheck} title="변호인: 다른 설명">
            {r.defense.length ? r.defense.map((a) => <p key={a.id}><strong>{DOUBT_LABEL[a.kind]}</strong> · {a.text}{cite(a.cite)}</p>) : <p className="text-text-muted">근거 카드가 뒷받침하는 대안 설명이 없었어요.</p>}
            {note("변호인")}
          </Step>
          <Step icon={Users} title="배심원 의심">
            <ul className="grid gap-1">
              {r.jurors.map((j) => (
                <li key={j.juror}>
                  <span className="font-semibold">배심원 {j.juror}</span> ({j.perspective.replace(/^관점: /, "").split(".")[0]}):{" "}
                  {j.doubt ? <>판단 불가로 낮춤 · {DOUBT_LABEL[j.doubt.kind]}: {j.doubt.text}{cite(j.doubt.cite)}</> : "판정 유지"}
                </li>
              ))}
            </ul>
            {note("배심원")}
          </Step>
        </>
      )}
      <Step icon={Gavel} title="판결" last>
        <p className="font-semibold">{r.judgment.headline}</p>
        {r.judgment.keyEvidence.length > 0 && <p>핵심 근거{cite(r.judgment.keyEvidence)}</p>}
        {r.judgment.remainingDoubts.length > 0 && (
          <div>
            <p className="font-semibold">남은 의심</p>
            <ul className="list-disc pl-5">{r.judgment.remainingDoubts.map((d, i) => <li key={i}>{d.text}{cite(d.cite)}</li>)}</ul>
          </div>
        )}
        <div>
          <p className="font-semibold">직접 확인하는 법</p>
          <ul className="list-disc pl-5">{r.judgment.howToCheck.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      </Step>
    </ol>
  );
}

export function CardList({ c }: { c: PublicCase }) {
  return (
    <ul className="grid gap-2">
      {c.cards.map((k) => (
        <li key={k.id} id={`card-${k.id}`} className="scroll-mt-4 rounded-md border border-border p-3 text-sm target:border-accent">
          <p>
            <span className="mr-2 rounded-sm border border-border-input px-1.5 font-mono text-xs">{k.id}</span>
            <strong>{k.label}</strong>
            {k.date && <span className="text-text-muted"> · {k.date}</span>}
          </p>
          <p className="mt-1">{k.summary}</p>
          {k.sourceUrl && <p className="mt-1 break-all text-text-muted">{k.sourceUrl}</p>}
        </li>
      ))}
    </ul>
  );
}

export function CaseHero({ c }: { c: PublicCase }) {
  const s = VERDICT_STYLE[c.verdict];
  return (
    <header className={cx("grid gap-4 rounded-lg border-l-4 p-4 md:grid-cols-[1fr_16rem] md:p-6", s.bg, s.border)}>
      <div className="grid content-start gap-2">
        <VerdictLabel verdict={c.verdict} className="text-lg" />
        <h1 className="text-xl leading-snug md:text-2xl">{c.truthTitle}</h1>
        <p>{c.summary}</p>
        <p className="text-sm text-text-muted">
          {topicLabel(c.topic)} · 유포 경로(제보): {c.channels.map(channelLabel).join(", ")} · 게재 {c.publishedAt?.slice(0, 10)}
          {c.topic === "politics" ? " · 검토자 2명 승인" : " · 운영자 승인"}
        </p>
      </div>
      {c.imagePath ? <BlurredImage src={c.imagePath} alt={c.imageAlt} blurred={isBlurred(c.verdict)} /> : (
        <p className="grid place-items-center rounded-md bg-bg p-4 text-center text-sm text-text-muted">이미지 없이 게재한 사례예요</p>
      )}
    </header>
  );
}

