import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DESKS } from "./desks";
import type { CaseRepository } from "./repository";
import { ReportStore } from "./harness/store";
import { REPORT_SECTIONS, renderReport } from "./harness/validator";
import { digest, projectRoot, protectionGuard } from "./harness/guard";
import { deskFacts, evidenceIds } from "./reporting";
/** Historical records only: no reruns, LLM attribution, approval or animation events. */
export function migrateLegacyReports(repo:CaseRepository,store=new ReportStore()){
 const guard=protectionGuard();
 for(const c of repo.list()){
  if(c.run)continue;
  for(const d of DESKS){
   if(c.desks?.[d.id]||!d.departments.some(dep=>c.sections[dep]))continue;
   const sections=d.departments.map(dep=>c.sections[dep]);
   const status=sections.every(s=>s?.state==="done")?"pass":sections.some(s=>s?.state==="waiting")?"hold":"stopped";
   const instruction=readFileSync(join(projectRoot(),"newsroom/desks",d.instruction),"utf8");
   const bodies=Object.fromEntries(REPORT_SECTIONS.map(h=>[h,deskFacts(c,d.id).filter(f=>f.section===h).map(f=>f.text.replace("LLM은 허용된 기록의 구성·순서만 정했습니다.","이 보고서는 기존 코드 기록을 옮긴 문서이며 LLM이 작성하지 않았습니다.")+(f.cite.length?` [근거:${f.cite.join(",")}]`:""))])) as Record<typeof REPORT_SECTIONS[number],string[]>;
   bodies["접수 확인"].unshift("이전 버전의 기록을 이관했습니다. 작업을 재실행하거나 판정·승인을 바꾸지 않았습니다.");
   for(const s of sections)if(s?.error)bodies["작업 결과"].push(s.error.message);
   const durationMs=sections.reduce((sum,s)=>sum+(s?.durationMs??0),0);
   const text=renderReport({version:1,caseId:c.id,desk:d.id,status,evidenceIds:evidenceIds(c),nextDesk:status==="pass"?DESKS[DESKS.findIndex(x=>x.id===d.id)+1]?.id??"editor":null,durationMs,instructionHash:digest(instruction),createdAt:new Date().toISOString(),author:"legacy"},bodies);
   guard();const saved=store.write(c.id,d.id,text,evidenceIds(c));
   repo.mutate(c.id,x=>{x.desks??={};x.desks[d.id]={state:status==="pass"?"done":status==="hold"?"hold":"failed",hash:saved.hash,calls:0,durationMs,error:sections.find(s=>s?.error)?.error?.message};});
  }
 }
}
