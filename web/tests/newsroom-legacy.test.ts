import {it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CaseRepository} from "../lib/newsroom/repository";
import {migrateLegacyReports} from "../lib/newsroom/legacy-reports";
import {ReportStore} from "../lib/newsroom/harness/store";
it("migrates partial stopped history without reruns, approvals, invented LLM work or animation",()=>{
 const repo=new CaseRepository(":memory:"),root=mkdtempSync(join(tmpdir(),"legacy-reports-")),store=new ReportStore(root);
 try{const c=repo.create({origin:"manual",claim:"실제 기록 이관 검사",claimedDate:null,pageUrl:"https://example.org",imageUrl:null,thumbnail:null,imageHash:null,provenance:[],candidateUrls:[],channels:[],topic:null,contentFlags:[],rightsConfirmed:false,reportedBy:"test"});
 repo.mutate(c.id,x=>{x.stage="osint";x.status="failed";x.sections.monitoring={department:"monitoring",state:"done",attempt:1,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),durationMs:1,data:{topic:"other",reportCount:1},error:null};x.sections.osint={department:"osint",state:"failed",attempt:1,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),durationMs:10,data:{},error:{code:"robots_unavailable",message:"접근 허용 확인 실패"}};});
 const events=repo.allEvents().length;migrateLegacyReports(repo,store);const migrated=repo.get(c.id)!;expect(migrated.status).toBe("failed");expect(migrated.stage).toBe("osint");expect(migrated.approvals).toEqual([]);expect(repo.allEvents()).toHaveLength(events);expect(store.read(c.id,"research")).toContain('"author":"legacy"');expect(store.read(c.id,"research")).toContain("접근 허용 확인 실패");const rev=migrated.revision;migrateLegacyReports(repo,store);expect(repo.get(c.id)!.revision).toBe(rev);
 }finally{repo.close();rmSync(root,{recursive:true,force:true});}
});
