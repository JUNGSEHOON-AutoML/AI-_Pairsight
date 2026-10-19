"use client";
// CompareView: desktop side by side (md and up), mobile overlay + slider (components.md §3).
// Differences are boxes on the image AND a numbered text list, so nothing depends on seeing colour.
import { useId, useState } from "react";
import { DATE_SOURCE_LABEL, type SourceMatch } from "@/lib/domain";
import { cx } from "./ui";

function Boxes({ match, show }: { match: SourceMatch; show: boolean }) {
  if (!show) return null;
  return (
    <>
      {match.diffRegions.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute rounded-sm border-2 border-highlight outline outline-1 outline-text"
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
        >
          <span className="absolute -left-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-highlight text-xs font-bold text-text">
            {i + 1}
          </span>
        </span>
      ))}
    </>
  );
}

function Caption({ match }: { match: SourceMatch }) {
  let host = match.url;
  try {
    host = new URL(match.url).hostname;
  } catch {}
  return (
    <figcaption className="mt-1.5 text-sm text-text-muted">
      <b className="text-text">원본 후보</b> ·{" "}
      <a href={match.url} target="_blank" rel="noopener noreferrer nofollow">
        {host}
        <span className="sr-only"> (새 창)</span>
      </a>
      {match.firstSeenAt && (
        <>
          {" "}
          · {match.firstSeenAt.slice(0, 10)} · {match.firstSeenSource ? DATE_SOURCE_LABEL[match.firstSeenSource] : "날짜 출처 모름"}
        </>
      )}
      {!match.firstSeenAt && " · 날짜를 확인하지 못했어요"}
      {match.excerpt && <span className="mt-1 block">{match.excerpt}</span>}
    </figcaption>
  );
}

export function CompareView({ match, uploadedUrl }: { match: SourceMatch; uploadedUrl: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  const [pos, setPos] = useState(50);
  const [showDiff, setShowDiff] = useState(true);
  const sliderId = useId();
  const hasDiff = match.diffRegions.length > 0;
  const original = match.imageUrl;

  return (
    <section aria-labelledby="compare-title" className="rounded-lg border border-border bg-bg p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="compare-title" className="text-base font-semibold">
          원본 후보 비교
        </h3>
        {hasDiff && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} className="size-4 accent-accent" />
            달라진 곳 표시
          </label>
        )}
      </div>

      {!original ? (
        <p className="rounded-md bg-surface p-4 text-sm">
          원본 이미지를 불러오지 못했어요.{" "}
          <a href={match.url} target="_blank" rel="noopener noreferrer nofollow">
            원본 페이지에서 직접 보기
          </a>
        </p>
      ) : (
        <>
          {/* Desktop: side by side */}
          <div className="hidden gap-3 md:grid md:grid-cols-2">
            <figure>
              <div style={{ aspectRatio: ratio }} className="relative overflow-hidden rounded-md bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={original} alt="찾아낸 원본 후보 이미지" className="size-full object-contain" />
              </div>
              <Caption match={match} />
            </figure>
            <figure>
              <div style={{ aspectRatio: ratio }} className="relative overflow-hidden rounded-md bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadedUrl} onLoad={e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} alt="검사한 이미지" className="size-full object-contain" />
                <Boxes match={match} show={showDiff} />
              </div>
              <figcaption className="mt-1.5 text-sm text-text-muted">
                <b className="text-text">검사한 이미지</b>
              </figcaption>
            </figure>
          </div>

          {/* Mobile: overlay + slider */}
          <div className="md:hidden">
            <figure>
              <div style={{ aspectRatio: ratio }} className="relative overflow-hidden rounded-md bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadedUrl} onLoad={e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} alt="" className="absolute inset-0 size-full object-contain" />
                <Boxes match={match} show={showDiff} />
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={original} alt="" className="size-full object-contain" />
                </div>
                <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-on-accent shadow-[0_0_0_1px_var(--color-text)]" style={{ left: `${pos}%` }} />
                <span className="absolute left-2 top-2 rounded-full bg-text px-2 py-0.5 text-xs font-semibold text-bg">원본 후보</span>
                <span className="absolute right-2 top-2 rounded-full bg-text px-2 py-0.5 text-xs font-semibold text-bg">검사한 이미지</span>
              </div>
              <Caption match={match} />
            </figure>
            <label htmlFor={sliderId} className="mt-3 block text-sm text-text-muted">
              후보와 검사한 이미지의 경계 옮기기 (정렬 전)
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-valuetext={`원본 ${pos}%`}
              className="w-full accent-accent"
            />
          </div>
        </>
      )}

      {match.comparison && <div className="mt-3 rounded-md bg-surface p-3 text-sm">
        <p>비교에서 감지한 변환: {[match.comparison.crop && "잘라내기", match.comparison.flip && "반전", match.comparison.colorAdjusted && "색보정"].filter(Boolean).join(" · ") || "없음"}</p>
        <p>pHash 거리 {match.comparison.pHashDistance} → 정렬 후 {match.comparison.alignedDistance} / 64 (진위 확률 아님)</p>
        <details className="mt-2"><summary>정렬 후 차이 히트맵</summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={match.comparison.heatmap} width={128} height={128} alt="정렬 후 픽셀 차이를 나타내는 히트맵. 붉을수록 차이가 큼." className="mt-2 bg-white" />
        </details>
        <p className="mt-1 text-text-muted">유사도나 차이만으로 조작·촬영 사실을 확정하지 않아요.</p>
      </div>}
      {!!match.dates?.length && <ul className="mt-2 text-xs text-text-muted">
        {match.dates.map((d, i) => <li key={i}>{d.value.slice(0, 10)} · {DATE_SOURCE_LABEL[d.source]} · 신뢰도 {d.confidence === "medium" ? "중" : "약"}{d.imageBound ? " · 해당 이미지 존재 확인" : " · 해당 날짜의 이미지 존재는 미확인"}</li>)}
        {match.dateDisputed && <li>날짜 기록이 서로 충돌해 날짜만으로 결론 내리지 않아요.</li>}
      </ul>}
      {hasDiff ? (
        <ol className={cx("mt-3 list-decimal pl-5 text-sm")} aria-label="달라진 곳">
          {match.diffRegions.map((r, i) => (
            <li key={i}>{r.note}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-text-muted">
          {match.similarity >= 0.98 ? "달라진 곳을 찾지 못했어요." : "비슷한 사진이지만 같은 사진이라고 보기는 어려워요."}
        </p>
      )}
    </section>
  );
}
