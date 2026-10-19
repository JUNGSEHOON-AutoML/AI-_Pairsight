"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, statusLabel, type CaseRecord } from "@/lib/newsroom/model";
import type { reliability } from "@/lib/newsroom/reliability";
import { ButtonLink, Panel } from "../ui";
import { FactcheckFeed, Logout } from "./forms";

export function RefreshCase() {
  const router=useRouter();
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},5000);return()=>clearInterval(timer);},[router]);
  return null;
}
export function NewsroomBoard({ initial, operator }: { initial: {cases:CaseRecord[];metrics:ReturnType<typeof reliability>};operator:string }) {
  const [data,setData]=useState(initial),[error,setError]=useState(""),router=useRouter();
  useEffect(()=>{let live=true;const controller=new AbortController();
    const timer=setInterval(async()=>{if(document.visibilityState!=="visible")return;try{const r=await fetch("/api/operator/cases",{cache:"no-store",signal:controller.signal});if(r.status===401){router.replace("/newsroom/login");return;}if(!r.ok)throw Error();const d=await r.json();if(live){setData(d);setError("");}}catch{if(live)setError("진행 상태 갱신에 실패했어요. 마지막 확인한 기록을 보여줘요.");}},5000);
    return()=>{live=false;controller.abort();clearInterval(timer);};},[router]);
  const m=data.metrics, waiting=data.cases.filter(c=>c.status==="awaiting_approval");
  const columns=[{id:"intake",label:"접수"},...DEPARTMENTS,{id:"complete",label:"완료"}];
  return <div className="grid min-w-0 gap-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-text-muted">운영자 {operator} · 비공개</p><h1 className="text-xl">편집국</h1><p className="mt-2 text-sm">한 사건의 근거와 기록을 부서마다 이어갑니다.</p></div><div className="flex flex-wrap gap-2"><ButtonLink href="/newsroom/new">새 사건 접수</ButtonLink><Logout /></div></header>
    {error&&<p role="alert">{error}</p>}
    <section aria-label="신뢰성 지표" className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["접수 사건",m.cases],["승인 대기",m.awaitingApproval],["중단 사건",m.failed],["사람 평가",m.evaluated ? `${m.evaluated}건 · 오판 ${m.wrong}건`:"미평가"]].map(([l,v])=><Panel key={l} className="p-4"><h2 className="text-sm text-text-muted">{l}</h2><p className="mt-2 text-xl">{v}</p></Panel>)}</section>
    <section className="grid gap-3"><h2 className="text-lg font-semibold">부서별 사건</h2><p className="text-sm text-text-muted">부서 하나가 실패하면 그 자리에서 멈춰요. 가로로 넘겨 나머지 부서를 확인할 수 있어요.</p>
      <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} aria-label="부서 칸반"><div className="flex w-max gap-3 bg-surface p-3">{columns.map(d=>{const rows=data.cases.filter(c=>c.stage===d.id);return <section key={d.id} className="w-56 rounded-md bg-bg p-3"><h3 className="mb-3 font-semibold">{d.label} <span className="text-text-muted">{rows.length}</span></h3><ul className="grid gap-3">{rows.map(c=><li key={c.id} className="rounded-md border border-border p-3"><Link href={"/newsroom/"+c.id} className="line-clamp-3 text-sm">{c.input.claim}</Link><p className="mt-2 text-xs text-text-muted">{statusLabel[c.status]}</p><p className="mt-1 text-xs">#{c.id.slice(0,8)}</p></li>)}</ul>{!rows.length&&<p className="text-sm text-text-muted">대기 사건 없음</p>}</section>;})}</div></div>
    </section>
    <Panel className="grid gap-3 p-4"><h2 className="text-lg font-semibold">승인 대기열</h2>{waiting.length?<ul className="grid gap-3">{waiting.map(c=><li key={c.id}><Link href={"/newsroom/"+c.id}>{c.input.claim}</Link><span className="ml-2 text-sm text-text-muted">검토 {c.approvals.length}건</span></li>)}</ul>:<p className="text-sm text-text-muted">사람 검토를 기다리는 사건이 없어요.</p>}</Panel>
    <FactcheckFeed />
    <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer font-semibold">신뢰성 분석 · 부서 지연과 실패</summary>
      <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead><tr>{["부서","시도","실패율","평균 시간","30초 초과"].map(t=><th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{m.departments.map(d=><tr key={d.id}><td className="p-2">{d.label}</td><td className="p-2">{d.attempts}</td><td className="p-2">{d.failureRate===null?"—":(d.failureRate*100).toFixed(0)+"%"}</td><td className="p-2">{d.meanMs===null?"—":(d.meanMs/1000).toFixed(1)+"초"}</td><td className="p-2">{d.slow}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-sm">오판·추가 검토 의심 {m.suspectedCaseIds.length}건. 정답 라벨이 없으면 정확도를 계산하지 않아요.</p>
    </details>
  </div>;
}
