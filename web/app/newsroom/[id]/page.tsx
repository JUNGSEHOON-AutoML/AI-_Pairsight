import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { currentOperator } from "@/lib/newsroom/operator-session";
import { caseRepository } from "@/lib/newsroom/repository";
import { DESKS, visibleStatus } from "@/lib/newsroom/desks";
import { ReportStore } from "@/lib/newsroom/harness/store";
import { digest } from "@/lib/newsroom/harness/guard";
import type { FactcheckData } from "@/lib/newsroom/workers";
import { RefreshCase } from "@/components/newsroom/board";
import { ReviewActions, CandidateSupplement } from "@/components/newsroom/forms";
import { MarkdownDocument } from "@/components/newsroom/markdown";
import "@/components/newsroom/workspace.css";
async function Detail({params}:{params:Promise<{id:string}>}) {
 if(!await currentOperator())redirect("/newsroom/login");
 const c=caseRepository().get((await params).id);if(!c||c.input.origin==="fixture")notFound();
 const store=new ReportStore(),fact=c.sections.factcheck?.data as FactcheckData|undefined;
 return <article className="report-stack"><RefreshCase/><header><Link href="/newsroom">← 편집장 브리핑</Link><p className="report-meta">비공개 사건 #{c.id.slice(0,8)}</p><h1 className="text-2xl my-3">{c.input.claim}</h1><p>{visibleStatus(c)}</p></header>
 {DESKS.map(d=>{let text:string|null=null;try{text=store.read(c.id,d.id);}catch{/* Invalid paths never rendered. */}const index=c.desks?.[d.id],valid=!!text&&digest(text)===index?.hash;return <section key={d.id} id={d.id} className={"report-sheet "+(d.id==="review"?"report-review":"")}><div><header><h2>{d.label} 보고서</h2><p className="report-meta">{index?`보고서 호출 ${index.calls}회 · ${(index.durationMs/1000).toFixed(1)}초`:"아직 이 데스크의 보고서가 없습니다."}</p></header>{index?.error&&<p className="report-error" role="alert">{index.error}</p>}{valid?<MarkdownDocument text={text!}/>:<p>{text?"기록이 변경되어 표시와 인계를 보류했습니다.":index?.state==="working"?"코드 작업과 보고서를 작성하고 있습니다.":"이전 데스크의 인계를 기다리고 있습니다."}</p>}{d.id==="research"&&c.status==="failed"&&<CandidateSupplement c={c}/>}</div>{d.id==="review"&&<ReviewActions c={c}/>}</section>;})}
 {fact?.court&&<details className="report-sheet"><summary>근거 카드와 법정 공방 원문</summary><ol>{fact.court.docket.cards.map(card=><li key={card.id} className="my-4"><strong>{card.id} · {card.label}</strong><p>{card.summary}</p>{card.sourceUrl&&<a href={card.sourceUrl} target="_blank" rel="noreferrer">출처 확인</a>}</li>)}</ol><p>{fact.court.judgment.headline}</p>{[...fact.court.prosecution,...fact.court.defense,...fact.court.jurors.flatMap(j=>j.doubt?[j.doubt]:[])].map((s,i)=><p className="my-3" key={i}>{s.text} · 근거 {s.cite.join(", ")}</p>)}</details>}
 </article>;
}
export default function Page({params}:{params:Promise<{id:string}>}){return <Suspense fallback={<p>사건 보고서 확인 중…</p>}><Detail params={params}/></Suspense>;}
