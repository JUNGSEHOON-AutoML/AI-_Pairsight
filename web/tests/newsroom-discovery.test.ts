import {afterEach, expect, it, vi} from "vitest";
import {CaseRepository} from "../lib/newsroom/repository";
import {FactCheckArticleDiscovery, GeminiSearchDiscovery} from "../lib/newsroom/candidate-discovery";
import {cachedFeed} from "../lib/newsroom/feed-service";
const repos:CaseRepository[]=[];
afterEach(()=>{repos.splice(0).forEach(r=>r.close());vi.unstubAllGlobals();vi.unstubAllEnvs();});
const repo=()=>{const r=new CaseRepository(":memory:");repos.push(r);return r;};
it("blocks grounding before network, quota charges or input persistence even with credentials",async()=>{
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);vi.stubEnv("GEMINI_API_KEY","test-secret");
 const r=repo(),p=new GeminiSearchDiscovery(r);
 const input={claim:"private claim",thumbnail:"data:image/png;base64,private",original:Buffer.from("private original")};
 await expect(p.discover(input,new AbortController().signal)).rejects.toMatchObject({code:"candidate_required",message:expect.stringContaining("약관")});
 expect(fetcher).not.toHaveBeenCalled();expect(p.usage().calls).toBe(0);expect(p.usage().limit).toBe(0);
 expect(r.db.prepare("SELECT * FROM grounding_daily").all()).toEqual([]);
 expect(new GeminiSearchDiscovery(r).usage(new Date("2026-10-20T06:59:00Z")).day).toBe("2026-10-19");
});
it("projects cached Fact Check results into URLs only, never ratings or summaries",async()=>{
 const r=repo();cachedFeed(r,"flood");
 r.db.prepare("INSERT INTO feed_cache VALUES(?,?,?)").run("flood",JSON.stringify([
  {url:"https://example.org/review",claim:"a false claim",rating:"FAKE",publisher:"publisher"},
  {url:"https://example.org/review",rating:"FALSE"}]),Date.now());
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 const result=await new FactCheckArticleDiscovery(r).discover({claim:"flood"},new AbortController().signal);
 expect(result).toEqual([{url:"https://example.org/review",provider:"Google Fact Check claims:search"}]);
 expect(fetcher).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toMatch(/FAKE|false claim|publisher/);
});
it("stops a no-candidate production case with a manual-link task without sending its image to Gemini",async()=>{
 const {createNewsroomWorkers}=await import("../lib/newsroom/workers");
 const {runCase}=await import("../lib/newsroom/flow");
 const {operatorTasks}=await import("../lib/newsroom/briefing");
 const {readFile}=await import("node:fs/promises");
 vi.stubEnv("GOOGLE_FACTCHECK_API_KEY","");const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 const r=repo(),c=r.create({origin:"manual",claim:"사진 확인",claimedDate:null,pageUrl:null,imageUrl:null,
  thumbnail:"data:image/png;base64,"+(await readFile("public/fixtures/inputs/edited.png")).toString("base64"),imageHash:"local",provenance:[],candidateUrls:[],channels:[],topic:null,contentFlags:[],rightsConfirmed:false,reportedBy:"visitor",externalSearchAllowed:true});
 const result=await runCase(r,c.id,createNewsroomWorkers(r));
 expect(result.status).toBe("failed");expect(result.stage).toBe("osint");
 expect(result.sections.osint?.error?.message).toContain("약관");
 expect(operatorTasks([result])[0].label).toContain("후보 링크");expect(fetcher).not.toHaveBeenCalled();
});
