/** Isolated comparison; never runs courts, advances live cases, approves, or publishes. */
import {DatabaseSync} from "node:sqlite";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {CaseRepository} from "../../lib/newsroom/repository";
import {createNewsroomWorkers,type AnalysisData,type OsintData} from "../../lib/newsroom/workers";
import {safeFailure} from "../../lib/newsroom/flow";
import type {CaseInput,CaseRecord} from "../../lib/newsroom/model";
import {OnDemandPageProvider,PolicyFetch,guardedTransport} from "../../lib/verification/page-fetch";
import {LocalImageComparisonProvider} from "../../lib/verification/image-comparison";
import {createMockProviders} from "../../lib/providers";
import {SCENARIO_DATA} from "../../lib/providers/mock/fixtures";
import {thumbnail,hash} from "../../lib/verification/retention";
import type {PageFetchProvider} from "../../lib/verification/types";

async function main(){
if(!process.argv.includes("--live"))throw Error("Explicit --live required: performs bounded public-page requests");
const source=new DatabaseSync(resolve(".newsroom/cases.sqlite"),{readOnly:true});
const serialized=source.prepare("SELECT record FROM cases ORDER BY id").all() as {record:string}[];
const digest=(rows:unknown)=>createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const before=digest(serialized);
const real=serialized.map(r=>JSON.parse(r.record) as CaseRecord).filter(c=>c.input.origin==="factcheck").slice(0,3);
const repo=new CaseRepository(":memory:");
const pages=new OnDemandPageProvider(new PolicyFetch(guardedTransport,1000));
const images=new LocalImageComparisonProvider();
type Result={fetched:number;comparedMatches:number|null;verified:number|null;status:string};
type Row=Result&{case:string;dataset:string;route:string;found:number|null};
const rows:Row[]=[];
async function evaluate(input:CaseInput,provider:PageFetchProvider):Promise<Result>{
 const c=repo.create({...input,origin:"fixture"}),workers=createNewsroomWorkers(repo,{pages:provider,images,allowTestProviders:true});
 let fetched=0;
 try{
  const signal=AbortSignal.timeout(90_000),out=await workers.osint.run(c,signal),o=out.data as unknown as OsintData;
  fetched=o.candidates.length;
  c.sections.osint={department:"osint",state:"done",attempt:1,startedAt:c.createdAt,finishedAt:c.createdAt,durationMs:0,data:out.data,error:null};
  const a=(await workers.ai_data.run(c,signal)).data as unknown as AnalysisData;
  const selected=o.selection==="operator";
  return {fetched,comparedMatches:a.collected.matches.length,verified:selected?a.collected.matches.length:null,status:selected?"compared":"circulated_photo_not_selected"};
 }catch(e){return {fetched,comparedMatches:null,verified:null,status:safeFailure(e).code};}
}
if(process.argv.includes("--reuse-real")){
 const previous=JSON.parse(readFileSync(resolve("../replica/discovery-comparison.json"),"utf8"));
 rows.push(...previous.rows.filter((r:Row)=>r.dataset==="real"));
}
else for(const c of real){
 const result=await evaluate(c.input,pages);
 // Same URL is the controlled manual input and the imported feed URL. Fetch once:
 // do not retry robots/bot blocks to manufacture a second route's result.
 rows.push({case:c.id.slice(0,8),dataset:"real",route:"manual-known-feed-url",found:1,...result});
 rows.push({case:c.id.slice(0,8),dataset:"real",route:"factcheck-import",found:1,...result});
 rows.push({case:c.id.slice(0,8),dataset:"real",route:"gemini",found:null,fetched:0,comparedMatches:null,verified:null,status:"terms_blocked"});
 console.log(JSON.stringify({case:c.id.slice(0,8),status:result.status,fetched:result.fetched}));
}
const pilots=[
 {id:"fx-trusted-edited",image:"trusted_edited",url:SCENARIO_DATA.trusted_edited.matches[0].url},
 {id:"fx-context-factcheck",image:"miscontextualized",url:"https://factcheck.example.test/claims/winter-market"},
 {id:"fx-no-source-shared-art",image:"no_source",url:SCENARIO_DATA.trusted_edited.matches[0].url},
 {id:"fx-different-scene",image:"tests/fixtures/comparison/unrelated.png",url:SCENARIO_DATA.trusted_edited.matches[0].url},
];
for(const p of pilots){
 const b=await thumbnail(readFileSync(p.image.startsWith("tests/")?p.image:`public/fixtures/inputs/${p.image}.png`));
 const base:CaseInput={origin:"fixture",claim:"테스트 전용 비교",claimedDate:null,pageUrl:null,imageUrl:null,thumbnail:"data:image/png;base64,"+Buffer.from(b).toString("base64"),imageHash:hash(b),provenance:[],candidateUrls:[],channels:[],topic:null,contentFlags:[],rightsConfirmed:false,reportedBy:"evaluation"};
 const mockPages=createMockProviders().pages;
 for(const route of ["manual","factcheck-mock-article"]){
  const input=route==="manual"?{...base,candidateUrls:[p.url]}:{...base,feedReview:{url:p.url,publisher:"fixture",rating:"NOT EVIDENCE",reviewedAt:null}};
  rows.push({case:p.id,dataset:"synthetic-pilot",route,found:1,...await evaluate(input,mockPages)});
 }
 rows.push({case:p.id,dataset:"synthetic-pilot",route:"gemini",found:null,fetched:0,comparedMatches:null,verified:null,status:"terms_blocked"});
}
const unchanged=before===digest(source.prepare("SELECT record FROM cases ORDER BY id").all());
source.close();repo.close();
if(!unchanged)throw Error("Live case records changed during evaluation; rerun when idle");
const output={date:"2026-10-20",liveCasesUnchanged:unchanged,groundingCalls:0,sceneGate:"production DINOv2 + fixed thresholds",realPilotDatasetAvailable:false,realMeasurementReused:process.argv.includes("--reuse-real"),notes:["수동 대조 경로는 기존 피드 URL을 지정했습니다. 독립적인 검색 성능·재현율 측정이 아닙니다.","실제 접수 3건 중 2건은 같은 네팔 홍수 주장입니다. 독립 사건 3개를 대표하지 않습니다.","실제 접수에 비교할 유포 사진이 별도로 지정되지 않았습니다. 미측정은 불일치 0건과 다릅니다.","파일럿은 기존 합성 그림을 사용한 테스트입니다. 실제 유포 사례가 아니며 대시보드에 넣지 않습니다.","no_source fixture는 다른 fixture와 같은 밑그림을 공유합니다. 그 사진의 일치는 검색 미발견 시나리오와 구분합니다.","이 보고서는 고해상도 원본·HTML·Gemini 응답·외부 기관의 판정 문구를 저장하지 않습니다."],rows};
writeFileSync(resolve("../replica/discovery-comparison.json"),JSON.stringify(output,null,2)+"\n");
const val=(n:number|null)=>n===null?"미측정":String(n);
const md=["# 후보 경로 비교 — 2026-10-20","",...output.notes.map(n=>"- "+n),"","| 사건 | 자료 | 후보 경로 | 후보 | 페이지 확인 | 사진 일치 | 검증 통과 | 상태 |","|---|---|---|---:|---:|---:|---:|---|"];
for(const r of rows)md.push(`| ${r.case} | ${r.dataset} | ${r.route} | ${val(r.found)} | ${r.fetched} | ${val(r.comparedMatches)} | ${val(r.verified)} | ${r.status} |`);
md.push("","실제 사건에 비교할 유포 사진을 지정하고 허용되는 후보 페이지를 제공해야 실제 진위 검증 통과율을 측정할 수 있습니다. 이 표는 검증 정확도를 주장하지 않습니다. Gemini는 약관상 미실행이므로 후보 0개로 평가하지 않았습니다.","");
writeFileSync(resolve("../replica/discovery-comparison.md"),md.join("\n"));
console.log(JSON.stringify({rows:rows.length,liveCasesUnchanged:unchanged,groundingCalls:0}));

}
main().catch(()=>{console.error("Comparison aborted; no upstream error body or credentials are logged.");process.exitCode=1;});
