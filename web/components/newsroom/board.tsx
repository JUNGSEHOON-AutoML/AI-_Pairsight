"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DESKS } from "@/lib/newsroom/desks";
import { MarkdownDocument } from "./markdown";
import type { LiveSnapshot } from "@/lib/newsroom/live";
import { FactcheckFeed, Logout } from "./forms";
import "./workspace.css";

export function RefreshCase() {
  const router=useRouter();
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},5000);return()=>clearInterval(timer);},[router]);
  return null;
}
export function NewsroomBoard({ initial, operator }: {initial:LiveSnapshot;operator:string}) {
  const [data,setData]=useState(initial),[connected,setConnected]=useState(false);
  const [selected,setSelected]=useState(initial.cases[0]?.id??""),[room,setRoom]=useState("intake");
  const [frameReady,setFrameReady]=useState(false),[frameAttempt,setFrameAttempt]=useState(0);
  const iframe=useRef<HTMLIFrameElement>(null),router=useRouter();
  const chosen=data.cases.find(c=>c.id===selected);
  const selectedRoom=chosen?.desk??room;
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
      if(e.data?.type==="pairsight:select" && [...DESKS.map(d=>d.id),"editor","operator"].includes(e.data.department)) {setSelected("");setRoom(e.data.department);}
    };
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[]);
  const briefSummary=data.briefing?.markdown.split("## 요약 3줄\n")[1]?.split("\n\n## ")[0]??"";
  return <div className="newsroom-workspace">
    <header className="nw-heading"><div><p className="nw-eyebrow">PAIRSIGHT / NEWSROOM</p><h1>편집장에게 듣는 오늘의 소식</h1><p className="nw-muted">{operator} · 운영자 전용</p></div><div className="nw-heading-actions"><Link className="nw-primary" href="/newsroom/new">사건 접수</Link><Logout /></div></header>
    <div className="nw-shell">
      <aside className="nw-dashboard" aria-label="편집장 브리핑과 할 일">
        <section className="editor-brief"><p className="nw-eyebrow">EDITOR’S BRIEF</p><h2>최신 브리핑</h2>{data.briefing?<><p className="report-meta">{new Date(data.briefing.at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})} KST</p><MarkdownDocument text={briefSummary}/>{data.briefing.markdown.includes("비상 현황")&&<p className="nw-note">편집장 LLM 연결을 확인하지 못해 코드가 현재 상태를 정리했습니다.</p>}</>:<p className="nw-note">편집장이 첫 브리핑을 준비하고 있습니다. 아래에는 현재 필요한 조치를 바로 표시합니다.</p>}</section>
        <section className="editor-tasks"><h2>운영자가 할 일 <span>{data.tasks.length}</span></h2><ul>{data.tasks.map(t=><li key={t.caseId}><Link href={"/newsroom/"+t.caseId+"#review"}>{t.label}</Link><p>{t.reason}</p><small>사건 #{t.caseId.slice(0,8)}</small></li>)}</ul>{!data.tasks.length&&<p className="nw-note">지금 필요한 조치가 없습니다.</p>}</section>
        {data.briefing&&<details className="editor-full-brief"><summary>브리핑 전문 읽기</summary><MarkdownDocument text={data.briefing.markdown}/></details>}
        <details className="editor-case-list" open><summary>사건 목록 · {data.cases.length}건</summary><ul className="nw-case-list">{data.cases.map(c=><li key={c.id}><button className="nw-case-card" data-case-id={c.id} aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)}><strong>{c.published?.truthTitle??c.claim}</strong><span className="nw-card-bottom"><span>{c.displayStatus}</span><span>#{c.id.slice(0,6)}</span></span></button><Link className="nw-detail-link" href={"/newsroom/"+c.id}>보고서 읽기 →</Link></li>)}</ul></details>
      </aside>
      <section className="nw-control" aria-label="실시간 편집국">
        <div className="nw-livebar"><span className={"nw-connection "+(connected?"is-live":"")} role="status">● {connected?"실시간 연결":"연결 확인 중 · 마지막 기록"}</span><span>5개 데스크 + 편집장 · 보기 전용</span></div>
        <div className="nw-office"><iframe key={frameAttempt} ref={iframe} src="/controlroom/newsroom" title="실시간 3D 편집국" allow="" referrerPolicy="same-origin"/>{!frameReady&&<div className="nw-frame-loading"><p>3D 편집국 연결 중…</p><button onClick={()=>setFrameAttempt(n=>n+1)}>다시 연결</button></div>}<div className="nw-office-caption"><span>CLAW3D</span><span>보고서 전달 · 편집장 브리핑</span></div></div>
        <div className="editor-selected">{chosen?<><p className="nw-eyebrow">선택한 사건</p><h2>{chosen.published?.truthTitle??chosen.claim}</h2><p>{chosen.displayStatus}</p>{chosen.error&&<p className="nw-error">{chosen.error}</p>}<Link className="nw-detail-link" href={"/newsroom/"+chosen.id}>다섯 데스크 보고서 읽기 →</Link></>:<p>왼쪽에서 사건을 선택하면 해당 데스크를 확인할 수 있습니다.</p>}
        {!data.cases.some(c=>c.status==="running")&&!data.room.departments.some(d=>d.state==="working")&&<p className="nw-note">현재 작업 중인 사건이 없습니다. 실제 작업과 보고서 전달이 있을 때 직원이 움직입니다.</p>}</div>
      </section>
    </div>
    <details className="nw-tools"><summary>새 사건 찾기 · 팩트체크 피드</summary><FactcheckFeed/></details>
    <p className="nw-public-link"><Link href="/check">방문자 제보 화면</Link> · <Link href="/cases">승인된 공개 사례</Link></p>
  </div>;
}
