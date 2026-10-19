import {afterEach,expect,it} from "vitest";
import {readFile} from "node:fs/promises";
import {CaseRepository} from "../lib/newsroom/repository";
import {createNewsroomWorkers,type AnalysisData,type OsintData} from "../lib/newsroom/workers";
import {LocalImageComparisonProvider} from "../lib/verification/image-comparison";
import type {CaseInput,CaseRecord} from "../lib/newsroom/model";
import type {PageFetchProvider} from "../lib/verification/types";
const stores:CaseRepository[]=[];afterEach(()=>stores.splice(0).forEach(r=>r.close()));
const review="https://review.example.test/article";
async function setup(matching=true){
 const repo=new CaseRepository(":memory:");stores.push(repo);
 const original=await readFile("tests/fixtures/comparison/original.png"),edited=await readFile("tests/fixtures/comparison/edited.png"),unrelated=await readFile("tests/fixtures/comparison/unrelated.png");
 const pages:PageFetchProvider={name:"fixture-pages",page:async url=>({url,title:"FAKE publisher verdict",excerpt:"UNTRUSTED VERDICT",review:{claim:"claim",rating:"FAKE",publisher:"publisher",claimComplete:true},dates:[],images:[1,2,3].map(n=>({url:`https://review.example.test/${n}.png`,alt:"",caption:"",role:"body"}))}),image:async url=>({bytes:matching&&url.endsWith("3.png")?original:unrelated,mime:"image/png"})};
 const input:CaseInput={origin:"fixture",claim:"사진 확인",claimedDate:null,pageUrl:null,imageUrl:null,thumbnail:"data:image/png;base64,"+edited.toString("base64"),imageHash:"input",provenance:[],candidateUrls:[],channels:[],topic:null,contentFlags:[],rightsConfirmed:false,reportedBy:"fixture",feedReview:{url:review,rating:"FAKE",publisher:"publisher",reviewedAt:null}};
 const c=repo.create(input),workers=createNewsroomWorkers(repo,{pages,images:new LocalImageComparisonProvider(null),allowTestProviders:true});
 return {repo,c,workers};
}
function attach(c:CaseRecord,data:Record<string,unknown>){c.sections.osint={department:"osint",state:"done",attempt:1,startedAt:c.createdAt,finishedAt:c.createdAt,durationMs:1,data,error:null};}
it("automatically compares the third article photo and retains photo/source facts, not the external verdict",async()=>{
 const {c,workers}=await setup();const signal=new AbortController().signal;
 const osint=await workers.osint.run(c,signal);attach(c,osint.data);
 expect((osint.data as unknown as OsintData).candidates[0].images).toHaveLength(3);
 expect((osint.data as unknown as OsintData).candidates[0].excerpt).toBe("");
 const result=(await workers.ai_data.run(c,signal)).data as unknown as AnalysisData;
 expect(result.collected.matches).toHaveLength(1);expect(result.collected.matches[0].provider).toBe("Google Fact Check claims:search");
 expect(result.collected.evidence.some(e=>e.kind==="image_comparison")).toBe(true);
 expect(result.collected.evidence.some(e=>e.kind==="fact_check")).toBe(false);
 expect(JSON.stringify(result)).not.toMatch(/FAKE|UNTRUSTED VERDICT/);
},20000);
it("an article verdict and a successful fetch cannot make unrelated photos evidence",async()=>{
 const {c,workers}=await setup(false);const signal=new AbortController().signal;
 attach(c,(await workers.osint.run(c,signal)).data);
 const result=(await workers.ai_data.run(c,signal)).data as unknown as AnalysisData;
 expect(result.collected.matches).toHaveLength(0);expect(result.collected.evidence).toHaveLength(0);
},20000);
it("routes additional feed discovery through page verification and stops if any photo fetch fails",async()=>{
 const {repo,c}=await setup();delete c.input.feedReview;
 let fetched=0;const pages:PageFetchProvider={name:"blocked",page:async url=>{fetched++;return {url,title:"",excerpt:"",dates:[],images:[{url:"https://example.org/photo.png",alt:"",caption:"",role:"body"}]};},image:async()=>{throw Error("secret upstream");}};
 const workers=createNewsroomWorkers(repo,{allowTestProviders:true,pages,discovery:{name:"feed",discover:async()=>[{url:review,provider:"Google Fact Check claims:search"}]}});
 await expect(workers.osint.run(c,new AbortController().signal)).rejects.toMatchObject({code:"candidate_image_failed"});expect(fetched).toBe(1);
});
it("excludes a review article hero image's self-comparison until the circulated photo is selected",async()=>{
 const {c,workers}=await setup();c.input.thumbnail=null;c.input.pageUrl=review;
 const signal=new AbortController().signal;attach(c,(await workers.osint.run(c,signal)).data);
 const result=(await workers.ai_data.run(c,signal)).data as unknown as AnalysisData;
 expect(result.collected.matches).toHaveLength(0);expect(result.warnings.join(" ")).toContain("자기 비교");
});
