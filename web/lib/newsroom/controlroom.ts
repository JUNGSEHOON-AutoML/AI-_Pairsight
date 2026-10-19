import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { DESKS, deskFor } from "./desks";
import { DEPARTMENTS, type CaseRecord } from "./model";
import type { CaseRepository } from "./repository";
import type { FactcheckData } from "./workers";
import { reliability } from "./reliability";

/** Deliberately omit input claims/images, operator identities, rejected prose and page text. */
export function newsroomSnapshot(repo: CaseRepository) {
  const cases=repo.list(), ids=new Set(cases.map(c=>c.id));
  const events=repo.allEvents().filter(e=>ids.has(e.caseId));
  const departments=[...DESKS.map(d=>({id:d.id,label:d.label,kind:"code+llm"})),{id:"editor",label:"편집장",kind:"llm"},{id:"operator",label:"운영자",kind:"human"}].map(d=>{
    const current=d.id==="editor"?cases.filter(c=>c.editor?.state==="working"):d.id==="operator"?cases.filter(c=>c.status==="awaiting_approval"):cases.filter(c=>deskFor(c.stage)===d.id);
    const working=d.id==="editor"?current.length>0:current.some(c=>c.status==="running");
    return {...d,state:working?"working":current.some(c=>c.status==="failed")?"blocked":current.some(c=>c.status==="awaiting_approval")?"waiting":"idle",cases:current.map(c=>({id:c.id,status:c.status,updatedAt:c.updatedAt}))};
  });
  const speech=(c:CaseRecord)=>{
    const f=c.sections.factcheck?.data as FactcheckData|undefined;
    if(!f?.court)return [];
    return [...f.court.prosecution.map(s=>({...s,role:"검사"})),...f.court.defense.map(s=>({...s,role:"변호인"})),...f.court.jurors.flatMap(j=>j.doubt?[{...j.doubt,role:"배심원 "+j.juror}]:[])]
      .map(s=>({caseId:c.id,role:s.role,summary:[...s.text].slice(0,200).join(""),cite:s.cite}));
  };
  return {readOnly:true,version:2,departments,cases:cases.map(c=>({id:c.id,stage:deskFor(c.stage),status:c.status})),
    events:events.slice(-160),speech:cases.flatMap(speech).slice(-30),metrics:reliability(cases,events)};
}
export function createNewsroomAdapter(repo:CaseRepository,token:string) {
  if(!/^[A-Za-z0-9_-]{32,}$/.test(token))throw Error("Control-room token missing or invalid");
  return createServer((req,res)=>{
    const send=(status:number,body:unknown)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(body));};
    const got=Buffer.from((req.headers.authorization??"").replace(/^Bearer /,"")),want=Buffer.from(token);
    if(got.length!==want.length||!timingSafeEqual(got,want))return send(401,{error:"unauthorized"});
    if(req.method!=="GET")return send(405,{error:"read_only"});
    const path=new URL(req.url??"/","http://127.0.0.1").pathname;
    if(path==="/health")return send(200,{ok:true,readOnly:true});
    const state=newsroomSnapshot(repo);
    if(path==="/state")return send(200,{profileName:"pairsight-newsroom",runtime:{name:"Pairsight 편집국",version:"1",governance:"read-only"},
      active:Object.fromEntries(DEPARTMENTS.map(d=>[d.id,[d.kind]])),pairsight:state});
    if(path==="/events")return send(200,{events:state.events});
    if(path==="/registry")return send(200,{models:{code:{readOnly:true},"code+llm":{readOnly:true},human:{readOnly:true}}});
    return send(404,{error:"not_found"});
  });
}
