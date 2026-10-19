"use client";
/* Thumbnails are already bounded, stripped images; no original is requested here. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, departmentLabel, statusLabel } from "@/lib/newsroom/model";
import { TOPICS, CHANNELS, FILTER_VERDICTS, isBlurred } from "@/lib/public/types";
import { VERDICT_LABEL } from "@/lib/domain";
import type { LiveSnapshot } from "@/lib/newsroom/live";
import { FactcheckFeed, Logout } from "./forms";
import "./workspace.css";

export function RefreshCase() {
  const router=useRouter();
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},5000);return()=>clearInterval(timer);},[router]);
  return null;
}
const time = (at:string) => new Date(at).toLocaleTimeString("ko-KR",{hour12:false,timeZone:"Asia/Seoul"});
export function NewsroomBoard({ initial, operator }: {initial:LiveSnapshot;operator:string}) {
  const [data,setData]=useState(initial),[connected,setConnected]=useState(false);
  const [selected,setSelected]=useState(initial.cases[0]?.id??""),[room,setRoom]=useState("monitoring");
  const [topic,setTopic]=useState("all"),[tab,setTab]=useState("active"),[verdict,setVerdict]=useState(""),[channel,setChannel]=useState("");
  const [frameReady,setFrameReady]=useState(false),[frameAttempt,setFrameAttempt]=useState(0);
  const iframe=useRef<HTMLIFrameElement>(null),router=useRouter();
  const chosen=data.cases.find(c=>c.id===selected);
  const selectedRoom=chosen ? (DEPARTMENTS.some(d=>d.id===chosen.stage)?chosen.stage:chosen.stage==="complete"?"literacy":"monitoring") : room;
  const latest=useRef({room:data.room,selectedCaseId:selected,selectedDepartment:selectedRoom,connected});
  useEffect(()=>{latest.current={room:data.room,selectedCaseId:selected,selectedDepartment:selectedRoom,connected};
    iframe.current?.contentWindow?.postMessage({type:"pairsight:snapshot",...latest.current},location.origin);
  },[data,selected,selectedRoom,connected,frameReady]);
  useEffect(()=>{
    const source=new EventSource("/api/operator/live"); let last=Date.now();
    source.addEventListener("snapshot",event=>{try{setData(JSON.parse((event as MessageEvent).data));setConnected(true);last=Date.now();}catch{setConnected(false);}});
    source.addEventListener("heartbeat",()=>{last=Date.now();setConnected(true);});
    source.addEventListener("expired",()=>{source.close();setConnected(false);router.replace("/newsroom/login");});
    source.addEventListener("unavailable",()=>setConnected(false));
    source.onerror=()=>{setConnected(false);void fetch("/api/operator/session",{cache:"no-store"}).then(r=>r.json()).then(s=>{if(!s.operator){source.close();router.replace("/newsroom/login");}}).catch(()=>{});};
    const timer=setInterval(()=>{if(Date.now()-last>20000)setConnected(false);},2000);
    return()=>{source.close();clearInterval(timer);};
  },[router]);
  useEffect(()=>{
    const receive=(e:MessageEvent)=>{
      if(e.origin!==location.origin || e.source!==iframe.current?.contentWindow)return;
      if(e.data?.type==="pairsight:ready") {setFrameReady(true);iframe.current?.contentWindow?.postMessage({type:"pairsight:snapshot",...latest.current},location.origin);}
      if(e.data?.type==="pairsight:select" && DEPARTMENTS.some(d=>d.id===e.data.department)) {setSelected("");setRoom(e.data.department);}
    };
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[]);
  const m=data.room.metrics;
  const scope=data.cases.filter(c=>tab==="public"?!!c.published:tab==="waiting"?c.status==="awaiting_approval":true);
  const rows=scope.filter(c=>(topic==="all"||c.topic===topic)&&(!verdict||c.verdict===verdict)&&(!channel||c.channels.some(x=>x===channel)));
  const events=data.room.events.filter(e=>selected?e.caseId===selected:e.department===selectedRoom).slice(-8).reverse();
  const activeRoom=data.room.departments.find(d=>d.id===selectedRoom);
  const stateLabel:Record<string,string>={working:"작업 중",blocked:"실패 · 중단",waiting:"사람 승인 대기",idle:"대기"};
  return <div className="newsroom-workspace">
    <header className="nw-heading"><div><p className="nw-eyebrow">PAIRSIGHT / LIVE NEWSROOM</p><h1>편집국 관제실</h1><p className="nw-muted">{operator} · 운영자 전용 · 사건 접수부터 공개까지</p></div><div className="nw-heading-actions"><Link className="nw-primary" href="/newsroom/new">＋ 사건 접수</Link><Logout /></div></header>
    <div className="nw-shell">
      <aside className="nw-dashboard" aria-label="카테고리 대시보드">
        <div className="nw-dashboard-title"><h2>사건 대시보드</h2><span>{data.cases.length}건</span></div>
        <nav className="nw-categories" aria-label="주제별 사건">
          {[{id:"all",label:"전체 주제"},...TOPICS].map(t=><button key={t.id} aria-pressed={topic===t.id} onClick={()=>setTopic(t.id)}><span>{t.label}</span><span>{scope.filter(c=>t.id==="all"||c.topic===t.id).length}</span></button>)}
        </nav>
        <div className="nw-tabs" role="group" aria-label="사건 공개 범위">{[["active","전체 사건"],["waiting","승인 대기"],["public","공개 사례"]].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setSelected(data.cases.find(c=>id==="public"?!!c.published:id==="waiting"?c.status==="awaiting_approval":true)?.id??"");}}>{label}</button>)}</div>
        <div className="nw-filters"><label>조작 유형<select value={verdict} onChange={e=>setVerdict(e.target.value)}><option value="">전체</option>{FILTER_VERDICTS.map(v=><option key={v} value={v}>{VERDICT_LABEL[v]}</option>)}</select></label><label>유포 경로<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">전체</option>{CHANNELS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div>
        <p className="nw-scope">{tab==="public"?"사람 승인이 끝난 결과만 표시합니다.":"비공개 접수 기록 · 주장은 검증 결과가 아닙니다."}</p>
        <ul className="nw-case-list">{rows.map(c=><li key={c.id}><button className="nw-case-card" aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)} data-case-id={c.id}>
          {c.published?.imagePath&&<div className="nw-thumb"><img src={c.published.imagePath} alt="검증 사례 썸네일" className={isBlurred(c.published.verdict)?"nw-blurred":""}/></div>}
          <span className="nw-card-top"><span>{TOPICS.find(t=>t.id===c.topic)?.label}</span><span>#{c.id.slice(0,6)}</span></span>
          <strong>{c.published?.truthTitle??c.claim}</strong><span className="nw-card-bottom"><span className={"nw-badge nw-status-"+c.status}>{statusLabel[c.status]}</span><span>{departmentLabel(c.stage)}</span></span>
          {c.verdict&&<span className="nw-verdict">{c.published?"판정":"검토 전 판정"} · {VERDICT_LABEL[c.verdict]}</span>}
        </button></li>)}</ul>
        {!rows.length&&<p className="nw-empty">{tab==="public"?"아직 공개 승인된 사건이 없어요.":"이 조건의 사건이 없어요."}</p>}
        <Link href="/cases" className="nw-public-link">방문자용 공개 사이트 ↗</Link>
      </aside>
      <section className="nw-control" aria-label="실시간 편집국">
        <div className="nw-livebar"><span className={"nw-connection "+(connected?"is-live":"")} role="status">● {connected?"실시간 연결":"연결 확인 중 · 마지막 기록"}</span><div><span>작업 <b>{data.cases.filter(c=>c.status==="running").length}</b></span><span>승인 대기 <b>{m.awaitingApproval}</b></span><span>중단 <b>{m.failed}</b></span></div></div>
        <div className="nw-office"><iframe key={frameAttempt} ref={iframe} src="/controlroom/newsroom" title="실시간 3D 편집국" allow="" referrerPolicy="same-origin" />
          {!frameReady&&<div className="nw-frame-loading"><p>3D 편집국 연결 중…</p><button onClick={()=>setFrameAttempt(n=>n+1)}>다시 연결</button></div>}
          <div className="nw-office-caption"><span>CLAW3D · 9개 부서</span><span>드래그 회전 · 스크롤 확대 · 부서 선택</span></div>
        </div>
        <nav className="nw-departments" aria-label="부서 진행 상태">{data.room.departments.map((d,i)=><button key={d.id} aria-pressed={selectedRoom===d.id} onClick={()=>{setSelected("");setRoom(d.id);}}><span className={"nw-dot nw-"+(connected?d.state:"idle")}/><span>{i+1}. {d.label}</span><small>{d.cases.length}</small></button>)}</nav>
        <div className="nw-inspector">
          <section aria-label="선택 사건"><p className="nw-eyebrow">{chosen?"SELECTED CASE":"DEPARTMENT"}</p><h2>{chosen?(chosen.published?.truthTitle??chosen.claim):activeRoom?.label}</h2><p className="nw-muted">{chosen?`${departmentLabel(chosen.stage)} · ${statusLabel[chosen.status]}`:`${activeRoom?.label} · ${stateLabel[activeRoom?.state??"idle"]}`} {!connected&&"· 마지막 확인 상태"}</p>
            {chosen?.error&&<p className="nw-error">{chosen.error}</p>}
            {chosen?.status==="awaiting_approval"&&<p className="nw-note">사람의 검토를 기다리고 있어요. 승인 전까지 다음 부서로 이동하지 않습니다.</p>}
            {!data.cases.some(c=>c.status==="running")&&<p className="nw-note">현재 처리 중인 사건이 없습니다. 새 작업이 시작되면 담당 에이전트가 책상으로 이동해 작업합니다.</p>}
            {chosen&&<Link className="nw-detail-link" href={"/newsroom/"+chosen.id}>근거·법정 기록{chosen.status==="awaiting_approval"?" 및 승인 검토":""} →</Link>}
            {chosen?.published&&<Link className="nw-detail-link" href={"/cases/"+chosen.published.slug}>공개 판결문 →</Link>}
          </section>
          <section aria-label="실시간 사건 기록"><h2>작업 기록 <span className="nw-muted">KST</span></h2><ol className="nw-events">{events.map(e=><li key={e.seq}><time>{time(e.at)}</time><div><span>{departmentLabel(e.department==="reliability"?"intake":e.department)}{e.department==="reliability"?" · 신뢰성":""}</span><p>{e.actor?e.actor+" · ":""}{e.summary}</p>{e.cite.length>0&&<small>근거 {e.cite.join(" · ")}</small>}</div></li>)}</ol>{!events.length&&<p className="nw-muted">아직 작업 기록이 없습니다.</p>}</section>
        </div>
      </section>
    </div>
    <details className="nw-tools"><summary>사건 들여오기 · Google Fact Check 피드</summary><FactcheckFeed /></details>
    <details className="nw-tools"><summary>신뢰성 분석 · 부서 지연과 실패</summary><p className="nw-note">{m.evaluated?`평가 ${m.evaluated}건 · 오판 ${m.wrong}건`:"정답 라벨 없음 · 정확도 미평가"} · 추가 검토 의심 {m.suspectedCaseIds.length}건</p><div className="nw-table"><table><thead><tr>{["부서","시도","실패율","평균 시간","30초 초과"].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{m.departments.map(d=><tr key={d.id}><td>{d.label}</td><td>{d.attempts}</td><td>{d.failureRate===null?"—":(d.failureRate*100).toFixed(0)+"%"}</td><td>{d.meanMs===null?"—":(d.meanMs/1000).toFixed(1)+"초"}</td><td>{d.slow}</td></tr>)}</tbody></table></div></details>
  </div>;
}
