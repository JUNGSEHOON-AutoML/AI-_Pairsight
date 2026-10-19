import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CaseRepository } from "./repository";
import type { CaseRecord } from "./model";
import type { LLMProvider } from "../llm/types";
import { DESKS, deskFor, visibleStatus } from "./desks";
import { composeFacts, reportingLLM, safeReportText, type ReportFact } from "./reporting";
import { projectRoot, newsroomRoot, digest, protectionGuard } from "./harness/guard";
import { reliability } from "./reliability";
export interface OperatorTask {caseId:string;label:string;reason:string}
export const operatorTasks=(cases:CaseRecord[]):OperatorTask[]=>cases.flatMap(c=>{
 const reason=Object.values(c.desks??{}).find(d=>d.error)?.error??Object.values(c.sections).find(s=>s.error)?.error?.message??"";
 if(c.status==="awaiting_approval")return [{caseId:c.id,label:"검토 보고서를 읽고 승인 또는 반려",reason:`사람 승인 ${c.approvals.length}/${c.sections.trust_safety?.data.requiredReviews??1}명`}];
 if(c.status==="failed")return [{caseId:c.id,label:/후보|링크|Gemini/.test(reason)?"후보 링크 보충 후 재시도":"중단 이유 확인 후 재시도",reason}];
 if(c.status==="rejected"||c.status==="withdrawn")return [{caseId:c.id,label:"반려·철회 기록 확인",reason:"자동 재개하거나 공개하지 않습니다."}];return [];
});
const schema=(repo:CaseRepository)=>repo.db.exec("CREATE TABLE IF NOT EXISTS newsroom_briefings(key TEXT PRIMARY KEY,at TEXT NOT NULL,state TEXT NOT NULL,path TEXT NOT NULL,hash TEXT,expires INTEGER NOT NULL)");
export const briefingSignature=(c:CaseRecord)=>digest(JSON.stringify({status:c.status,sections:Object.values(c.sections).map(s=>[s.state,s.attempt]),desks:c.desks,approvals:c.approvals.length}));
export const koreaDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export function latestBriefing(repo:CaseRepository,root=newsroomRoot()){
 schema(repo);const row=repo.db.prepare("SELECT key,at,path,hash FROM newsroom_briefings WHERE state='done' ORDER BY at DESC LIMIT 1").get() as {key:string;at:string;path:string;hash:string}|undefined;
 if(!row)return null;
 try{const path=join(root,"briefings",row.path);if(lstatSync(path).isSymbolicLink())return null;const markdown=readFileSync(path,"utf8");if(digest(markdown)!==row.hash)return null;return {key:row.key,at:row.at,markdown};}catch{return null;}
}
/** Persistent per-day/per-state claim; crashes can recover after the lease, never duplicate completed briefs. */
export async function writeBriefing(repo:CaseRepository,kind:"daily"|"case",caseId?:string,options:{llm?:LLMProvider;root?:string;guard?:()=>void;timeoutMs?:number;retry?:boolean}={}){
 schema(repo);const all=repo.list(),c=caseId?repo.get(caseId):null;if(caseId&&(!c||c.input.origin==="fixture"))return;
 const cases=c?[c]:all,key=kind==="daily"?`daily-${koreaDay()}`:`case-${caseId}-${briefingSignature(c!)}`;
 const at=new Date().toISOString(),now=Date.now(),filename=`${kind}-${randomUUID()}.md`;
 const inserted=repo.db.prepare("INSERT INTO newsroom_briefings(key,at,state,path,expires) VALUES(?,?,'working',?,?) ON CONFLICT(key) DO UPDATE SET state='working',at=excluded.at,path=excluded.path,expires=excluded.expires WHERE (newsroom_briefings.state='working' AND newsroom_briefings.expires<?) OR (?=1 AND newsroom_briefings.state='done') RETURNING key").get(key,at,filename,now+180000,now,options.retry?1:0);
 if(!inserted)return;
 const eventCase=c??all[0];
 if(eventCase)repo.mutate(eventCase.id,(x,emit)=>{x.editor={state:"working",calls:(x.editor?.calls??0)+1,at};emit({department:"reliability",desk:"editor",action:"briefing_started",state:"agent_working",summary:kind==="daily"?"일일 브리핑 작성 시작":"사건 브리핑 작성 시작",cite:[]});});
 const facts:ReportFact[]=[],add=(section:string,text:string)=>facts.push({id:`F${facts.length+1}`,section,text:safeReportText(text),cite:[]});
 const tasks=operatorTasks(cases),metrics=reliability(all,repo.allEvents());
 add("요약 3줄",`대상 사건 ${cases.length}건, 완료 ${cases.filter(x=>x.status==="complete").length}건.`);
 add("요약 3줄",`사람의 조치가 필요한 사건 ${tasks.length}건.`);
 add("요약 3줄",metrics.evaluated?`사람 평가 ${metrics.evaluated}건 중 오판 ${metrics.wrong}건.`:"정답 라벨이 없어 정확도는 아직 평가하지 않았습니다.");
 for(const x of cases.slice(0,20))add("사건별 상태",`${x.id.slice(0,8)} · ${visibleStatus(x)} · ${DESKS.find(d=>d.id===deskFor(x.stage))?.label??"편집장"}`);
 if(cases.length>20)add("사건별 상태",`추가 ${cases.length-20}건은 사건 목록에서 확인하세요.`);
 for(const t of tasks.slice(0,20)){add("막힌 이유",`${t.caseId.slice(0,8)} · ${t.reason}`);add("운영자가 할 일",`${t.caseId.slice(0,8)} · ${t.label}`);}
 if(!tasks.length){add("막힌 이유","현재 조치가 필요한 중단 기록은 없습니다.");add("운영자가 할 일","진행 중인 사건과 새 제보를 확인하세요.");}
 const slow=metrics.departments.filter(d=>d.slow);if(slow.length)add("막힌 이유",`30초 초과 작업: ${slow.map(d=>d.label).join(", ")}. 실행 로그의 실제 소요 시간 기준입니다.`);
 let ordered=facts,author="llm",guard:(()=>void)|undefined;
 try{guard=options.guard??protectionGuard();guard();const instruction=readFileSync(join(projectRoot(),"newsroom/desks/06-editor.md"),"utf8");ordered=await composeFacts(facts,instruction,options.llm??reportingLLM(),AbortSignal.timeout(options.timeoutMs??120000));guard();}
 catch{author="code-fallback";} // Operator actions must remain visible even when the LLM/protection check fails.
 const heading=kind==="daily"?"일일 브리핑":"사건 브리핑";
 const markdown=`# ${heading}\n\n${at} · ${author==="llm"?"편집장 LLM 구성 · 코드 기록 기준":"LLM 브리핑을 완료하지 못해 코드가 비상 현황을 기록했습니다. 제공자·보호 파일 상태를 확인하세요."}\n\n`+["요약 3줄","사건별 상태","막힌 이유","운영자가 할 일"].map(h=>`## ${h}\n${ordered.filter(f=>f.section===h).map(f=>"- "+f.text).join("\n")}`).join("\n\n")+"\n";
 const dir=join(options.root??newsroomRoot(),"briefings");
 if(existsSync(dir)&&lstatSync(dir).isSymbolicLink())throw Error("Unsafe briefing directory");
 mkdirSync(dir,{recursive:true,mode:0o700});const temp=join(dir,`.${randomUUID()}.tmp`);writeFileSync(temp,markdown,{mode:0o600,flag:"wx"});renameSync(temp,join(dir,filename));
 repo.db.prepare("UPDATE newsroom_briefings SET state='done',hash=? WHERE key=?").run(digest(markdown),key);
 if(eventCase)repo.mutate(eventCase.id,(x,emit)=>{x.editor={...x.editor!,state:author==="llm"?"done":"failed",at:new Date().toISOString()};emit({department:"reliability",desk:"editor",action:"briefing_completed",state:"done",summary:author==="llm"?heading+" 완료":heading+" 비상 현황 기록 · LLM 확인 필요",cite:[]});});
 return {key,at,markdown};
}
