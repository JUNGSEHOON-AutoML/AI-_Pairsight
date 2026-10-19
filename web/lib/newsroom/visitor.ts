import { randomBytes,createHash } from "node:crypto";
import type { CaseRepository } from "./repository";
import type { CaseRecord } from "./model";
import { CaseError } from "./model";
import { visibleStatus } from "./desks";
import { publicProjection } from "./review";
import { publishProblems } from "../public/types";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export const VISITOR_COOKIE="pairsight_submission";
export class VisitorAccess {
 constructor(private repo:CaseRepository){repo.db.exec("CREATE TABLE IF NOT EXISTS visitor_cases(case_id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS visitor_attempts(owner_hash TEXT NOT NULL,at INTEGER NOT NULL)");}
 session(token:string|undefined){return token&&/^[a-f0-9]{64}$/.test(token)?token:randomBytes(32).toString("hex");}
 reserve(token:string,now=Date.now()){
  this.repo.db.exec("BEGIN IMMEDIATE");try{
   const global=this.repo.db.prepare("SELECT count(*) AS n FROM visitor_attempts WHERE at>?").get(now-86400000) as {n:number};
   const owner=this.repo.db.prepare("SELECT count(*) AS n FROM visitor_attempts WHERE owner_hash=? AND at>?").get(hash(token),now-3600000) as {n:number};
   if(global.n>=20||owner.n>=3)throw new CaseError("intake_limit","시범 운영의 접수 한도에 도달했어요. 나중에 다시 접수해 주세요.");
   this.repo.db.prepare("INSERT INTO visitor_attempts VALUES(?,?)").run(hash(token),now);this.repo.db.exec("COMMIT");
  }catch(e){this.repo.db.exec("ROLLBACK");throw e;}
 }
 attach(id:string,token:string){this.repo.db.prepare("INSERT INTO visitor_cases VALUES(?,?,?)").run(id,hash(token),Date.now());}
 get(id:string,token:string|undefined):CaseRecord|null {
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=this.repo.db.prepare("SELECT case_id FROM visitor_cases WHERE case_id=? AND owner_hash=? AND at>?").get(id,hash(token),Date.now()-30*86400000);
  return row?this.repo.get(id):null;
 }
}
export function visitorView(c:CaseRecord){
 const pub=publicProjection(c),approved=pub&&!publishProblems(pub).length?pub:null;
 return {id:c.id,status:visibleStatus(c),claim:c.input.claim,needsHelp:c.status==="failed",result:approved?{slug:approved.slug,headline:approved.truthTitle,verdict:approved.verdict,cards:approved.cards.slice(0,3),court:approved.court}:null};
}
