import { randomUUID } from "node:crypto";
import { CaseError, type CaseRecord, type Department } from "./model";
import { DESKS, type Desk } from "./desks";
import { safeFailure, type Workers } from "./flow";
import type { CaseRepository } from "./repository";
import type { LLMProvider } from "../llm/types";
import { ReportStore } from "./harness/store";
import { protectionGuard, digest } from "./harness/guard";
import { validateReport } from "./harness/validator";
import { evidenceIds, reportingLLM, writeDeskReport } from "./reporting";

/** Existing worker sections/rules are retained. A validated Markdown report gates each new desk. */
export async function runDesks(repo:CaseRepository,id:string,workers:Workers,options:{llm?:LLMProvider;store?:ReportStore;timeoutMs?:number;allowFixture?:boolean;guard?:()=>void}={}) {
 const token=randomUUID(), timeout=options.timeoutMs??180000, store=options.store??new ReportStore();
 let c=repo.get(id);if(!c)throw new CaseError("not_found","사건이 없어요.");
 if(c.input.origin==="fixture"&&!options.allowFixture)throw new CaseError("fixture_forbidden","실제 편집국에서 시연 사건을 처리하지 않아요.");
 if(["complete","awaiting_approval","rejected","withdrawn"].includes(c.status))return c;
 if(c.run){if(c.run.expiresAt>Date.now())throw new CaseError("busy","이미 처리 중이에요.");return repo.mutate(id,(x,emit)=>{x.status="failed";x.run=null;emit({department:x.stage,state:"failed",summary:"작업 프로세스 중단. 운영자가 재시도해야 합니다.",cite:[]});});}
 c=repo.mutate(id,x=>{x.run={token,expiresAt:Date.now()+timeout*18};x.desks??={};});
 let desk:Desk="intake", current:Department="monitoring";
 const update=(fn:Parameters<CaseRepository["mutate"]>[1])=>{c=repo.mutate(id,(x,emit)=>{if(x.run?.token!==token)throw new CaseError("stale_run","작업 소유권이 바뀌었어요.");fn(x,emit);});return c!;};
 const bounded=async<T>(fn:(signal:AbortSignal)=>Promise<T>)=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new CaseError("worker_timeout","데스크 작업 시간이 초과됐어요."));},timeout);})]);}finally{clearTimeout(timer);controller.abort();}
 };
 try{
  const guard=options.guard??protectionGuard();guard();
  for(const d of DESKS){
   desk=d.id;current=d.departments[0];
   const index=c!.desks?.[desk];
   if(index?.state==="done"){
    const report=store.read(id,desk);
    if(!report||digest(report)!==index.hash)throw new CaseError("report_changed","마크다운 기록이 변경되었거나 없어 인계를 멈췄어요.");
    validateReport(report,{caseId:id,desk,evidenceIds:evidenceIds(c!)});guard();continue;
   }
   const started=Date.now();
   update((x)=>{x.desks![desk]={state:"working",calls:x.desks![desk]?.calls??0,durationMs:0};});
   for(const dep of d.departments){
    current=dep;
    if(c!.sections[dep]?.state==="done"||c!.sections[dep]?.state==="waiting")continue;
    const start=Date.now();guard();
    update((x,emit)=>{x.stage=dep;x.status="running";x.sections[dep]={department:dep,state:"running",attempt:(x.sections[dep]?.attempt??0)+1,startedAt:new Date(start).toISOString(),finishedAt:null,durationMs:null,data:{},error:null};emit({department:dep,desk,state:"running",summary:d.label+" 코드 작업 시작",cite:[]});});
    const result=await bounded(signal=>workers[dep].run(structuredClone(c!),signal));guard();
    if(result.waitForApproval&&dep!=="trust_safety")throw new CaseError("worker_contract","승인 대기는 검토 데스크만 가능합니다.");
    update((x,emit)=>{Object.assign(x.sections[dep]!,{state:result.waitForApproval?"waiting":"done",data:result.data,finishedAt:new Date().toISOString(),durationMs:Date.now()-start});emit({department:dep,desk,state:"done",summary:d.label+" 코드 작업 완료 · 보고서 작성 전",cite:[]});});
   }
   // Newly fetched instruction signals remain part of the original security section.
   if(desk==="research"){
    const security=await bounded(signal=>workers.security.run(structuredClone(c!),signal));
    update(x=>{if(x.sections.security)x.sections.security.data=security.data;});
   }
   const waiting=desk==="review"&&c!.sections.trust_safety?.state==="waiting";
   update((x,emit)=>{x.status="running";x.stage=d.departments[d.departments.length-1];x.desks![desk]!.calls++;emit({department:x.stage,desk,action:"report_started",state:"agent_working",summary:d.label+" 보고서 작성 시작",cite:[]});});
   const llm=options.llm??reportingLLM();
   if(llm.name.includes("mock")&&!options.allowFixture)throw new CaseError("mock_forbidden","실제 보고서에 mock은 사용할 수 없어요.");
   const markdown=await bounded(signal=>writeDeskReport(c!,desk,waiting?"hold":"pass",Date.now()-started,llm,signal));guard();
   const saved=store.write(id,desk,markdown,evidenceIds(c!));guard();
   update((x,emit)=>{x.desks![desk]={state:waiting?"hold":"done",hash:saved.hash,calls:x.desks![desk]!.calls,durationMs:Date.now()-started};x.status=waiting?"awaiting_approval":"running";emit({department:x.stage,desk,action:"report_completed",state:"done",summary:d.label+" 보고서 검사 통과",cite:saved.evidenceIds});if(waiting)x.run=null;});
   if(waiting)return c!;
  }
  return update((x,emit)=>{if(!x.approvals.length)throw new CaseError("approval_required","사람 승인 기록이 필요해요.");x.status="complete";x.stage="complete";x.run=null;emit({department:"complete",state:"complete",summary:"다섯 데스크의 보고서와 사람 승인 완료",cite:[]});});
 }catch(e){
  const error=safeFailure(e);
  return update((x,emit)=>{x.status="failed";x.desks??={};x.desks[desk]={...x.desks[desk],state:"failed",calls:x.desks[desk]?.calls??0,durationMs:x.desks[desk]?.durationMs??0,error:error.message};
   const s=x.sections[current];if(s?.state==="running"){s.state="failed";s.error=error;s.finishedAt=new Date().toISOString();s.durationMs=Date.now()-Date.parse(s.startedAt);if(e instanceof CaseError&&e.metrics)s.data={calls:e.metrics.llmCalls};}
   x.run=null;emit({department:x.stage,desk,state:"failed",summary:error.message,cite:[]});});
 }
}
