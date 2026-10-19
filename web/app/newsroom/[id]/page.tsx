import Link from "next/link";
/* eslint-disable @next/next/no-img-element -- only stripped local thumbnail data URLs */
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { currentOperator } from "@/lib/newsroom/operator-session";
import { caseRepository } from "@/lib/newsroom/repository";
import { DEPARTMENTS, departmentLabel, statusLabel } from "@/lib/newsroom/model";
import { VERDICT_LABEL } from "@/lib/domain";
import type { FactcheckData } from "@/lib/newsroom/workers";
import { RefreshCase } from "@/components/newsroom/board";
import { ReviewActions } from "@/components/newsroom/forms";
import { Panel } from "@/components/ui";

function textRecord(value: unknown): unknown {
  if(typeof value==="string")return value.startsWith("data:image/")?"[이미지: 아래 미리보기]":value;
  if(Array.isArray(value))return value.map(textRecord);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([k])=>k!=="untrustedPageText").map(([k,v])=>[k,textRecord(v)]));
  return value;
}
function previews(value: unknown): string[] {
  if(typeof value==="string")return /^data:image\/(png|jpeg|webp);base64,/.test(value)?[value]:[];
  if(value&&typeof value==="object")return Object.values(value).flatMap(previews);
  return [];
}
async function Detail({params}:{params:Promise<{id:string}>}) {
  if(!await currentOperator())redirect("/newsroom/login");
  const c=caseRepository().get((await params).id);if(!c||c.input.origin==="fixture")notFound();
  const fact=c.sections.factcheck?.data as FactcheckData|undefined;
  const forbidden=c.input.contentFlags.includes("sexual_content");
  return <div className="grid min-w-0 gap-6">
    <RefreshCase /><header className="grid gap-2"><Link href="/newsroom">← 편집국</Link><p className="text-sm text-text-muted">사건 #{c.id.slice(0,8)} · 비공개</p><h1 className="text-xl break-words">{c.input.claim}</h1><p>{departmentLabel(c.stage)} · {statusLabel[c.status]}</p></header>
    {c.input.feedReview&&<Panel className="grid gap-2 p-4"><h2 className="font-semibold">외부 팩트체크 결과</h2><p className="text-sm">{c.input.feedReview.publisher} · 출처의 평가: {c.input.feedReview.rating}</p><a href={c.input.feedReview.url} target="_blank" rel="noreferrer">출처 보기</a><p className="text-sm text-text-muted">이 평가는 Pairsight의 판정이 아니에요. 별도 검증을 거쳐야 해요.</p></Panel>}
    {forbidden?<p role="note">성적 콘텐츠는 이미지를 저장하거나 표시하지 않아요. 게재 대상에서 제외하고 플랫폼 신고 기능을 이용해 주세요.</p>:c.input.thumbnail&&<img src={c.input.thumbnail} alt="제출 이미지 썸네일" className="max-h-64 max-w-full rounded-lg object-contain" />}
    {fact?.court&&<Panel className="grid gap-2 p-4"><h2 className="text-lg font-semibold">법정 · {VERDICT_LABEL[fact.court.finalVerdict]}</h2><p className="text-sm">규칙 {fact.rule} · LLM 호출 {fact.calls}회 · {fact.court.opened?"공방 진행":"공방 생략"}</p><p>{fact.court.judgment.headline}</p></Panel>}
    <ol className="grid gap-4">{DEPARTMENTS.map(d=>{const s=c.sections[d.id], images=forbidden?[]:[...new Set(previews(s?.data))].slice(0,8);return <li key={d.id}><Panel className="grid gap-3 p-4"><h2 className="text-lg font-semibold">{d.label} · {s?({running:"작업 중",done:"완료",failed:"실패",waiting:"승인 대기"}[s.state]):"진행 전"}</h2><p className="text-sm text-text-muted">{d.input} → {d.output} · {d.kind==="human"?"사람":d.kind==="code+llm"?"코드 + LLM":"코드"}</p><p className="text-sm">{d.permission}</p>
      {s&&<p className="text-xs text-text-muted">시도 {s.attempt}회 · {s.durationMs===null?"진행 중":(s.durationMs/1000).toFixed(2)+"초"}</p>}
      {s?.error&&<p role="alert" className="rounded-md bg-surface p-3">{s.error.message} ({s.error.code})</p>}
      {images.length>0&&<div className="flex flex-wrap gap-3">{images.map((src,i)=><img key={i} src={src} alt={d.label+" 비교 이미지·히트맵 "+(i+1)} className="max-h-48 max-w-full rounded-md object-contain" />)}</div>}
      {s&&Object.keys(s.data).length>0&&<details><summary className="cursor-pointer text-sm">부서 기록 · 근거 ID · 날짜 출처</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface p-3 text-xs">{JSON.stringify(textRecord(s.data),null,2)}</pre></details>}
    </Panel></li>;})}</ol><ReviewActions c={c} />
  </div>;
}
export default function Page({params}:{params:Promise<{id:string}>}){return <Suspense fallback={<p>사건 확인 중…</p>}><Detail params={params} /></Suspense>;}
