import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPORT_SECTIONS, renderReport, validateReport, type ReportMeta } from "../lib/newsroom/harness/validator";
import { protectionGuard, digest } from "../lib/newsroom/harness/guard";
import { ReportStore } from "../lib/newsroom/harness/store";
const id = "00000000-0000-4000-8000-000000000001";
const meta:ReportMeta = { version:1,caseId:id,desk:"intake",status:"pass",evidenceIds:["E1"],nextDesk:"research",durationMs:12,instructionHash:"a".repeat(64),createdAt:new Date().toISOString(),author:"llm" };
const body = Object.fromEntries(REPORT_SECTIONS.map(h=>[h,["확인 [근거:E1]"]])) as Record<typeof REPORT_SECTIONS[number],string[]>;
const valid = () => renderReport(meta,body);
const expected = {caseId:id,desk:"intake" as const,evidenceIds:["E1"]};
describe("markdown handoff boundary",()=>{
 it("validates canonical front matter, required bodies and citations before storing",()=>{
  const dir=mkdtempSync(join(tmpdir(),"reports-"));try{ const store=new ReportStore(dir);expect(store.write(id,"intake",valid(),["E1"]).status).toBe("pass");expect(store.read(id,"intake")).toBe(valid()); }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it.each([()=>valid().replace('"durationMs":12','"durationMs":-1'),()=>valid().replace('"caseId":"'+id+'"','"caseId":"other"'),()=>valid().replace("## 인계","## 다른 제목"),()=>valid().replace("[근거:E1]","[근거:invented]"),()=>valid()+"<script>alert(1)</script>",()=>valid().replace('"status":"pass"','"status":"approved"')])("rejects malformed/forged report without handoff",f=>expect(()=>validateReport(f(),expected)).toThrow());
 it("stops immediately if protected code or the manifest changes",()=>{
  const dir=mkdtempSync(join(tmpdir(),"guard-"));try{mkdirSync(join(dir,"newsroom"));writeFileSync(join(dir,"rule.ts"),"original");const manifest=join(dir,"newsroom/protected.json");writeFileSync(manifest,JSON.stringify({"rule.ts":digest("original")}));const check=protectionGuard(dir);writeFileSync(join(dir,"rule.ts"),"changed");expect(check).toThrow(/해시/);writeFileSync(join(dir,"rule.ts"),"original");check();writeFileSync(manifest,readFileSync(manifest,"utf8")+" ");expect(check).toThrow(/해시/);}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("rejects traversal before filesystem writes",()=>expect(()=>new ReportStore().read("../../outside","intake")).toThrow());
});
