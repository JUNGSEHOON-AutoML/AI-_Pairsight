import { describe,it,expect } from "vitest";
import { once } from "node:events";
import { CaseRepository } from "../lib/newsroom/repository";
import { createNewsroomAdapter,newsroomSnapshot } from "../lib/newsroom/controlroom";
import type { CaseInput } from "../lib/newsroom/model";
const input:CaseInput={origin:"manual",claim:"private claim",claimedDate:null,pageUrl:null,imageUrl:null,thumbnail:null,imageHash:null,provenance:[],candidateUrls:[],channels:[],topic:null,contentFlags:[],rightsConfirmed:false,reportedBy:"private-operator"};
describe("real case control room",()=>{
  it("projects nine departments, stops on failure and excludes fixtures and private input",()=>{
    const r=new CaseRepository(":memory:");const c=r.create(input);r.create({...input,origin:"fixture"});
    r.mutate(c.id,(x,emit)=>{x.stage="osint";x.status="running";emit({department:"osint",state:"running",summary:"OSINT 처리 시작",cite:[]});});
    let s=newsroomSnapshot(r);expect(s.departments).toHaveLength(9);expect(s.cases).toHaveLength(1);expect(s.departments[1].state).toBe("working");
    expect(JSON.stringify(s)).not.toContain("private");
    r.mutate(c.id,x=>{x.status="failed";});s=newsroomSnapshot(r);expect(s.departments[1].state).toBe("blocked");expect(s.metrics.failed).toBe(1);r.close();
  });
  it("requires a token and rejects every mutation even with the correct token",async()=>{
    const r=new CaseRepository(":memory:"),token="test-only-controlroom-token-12345678",server=createNewsroomAdapter(r,token);
    server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();if(!address||typeof address==="string")throw Error();
    const url="http://127.0.0.1:"+address.port,headers={authorization:"Bearer "+token};
    try {expect((await fetch(url+"/state")).status).toBe(401);expect((await fetch(url+"/state",{headers})).status).toBe(200);
      for(const method of ["POST","PUT","PATCH","DELETE"])expect((await fetch(url+"/state",{method,headers})).status).toBe(405);
      expect((await fetch(url+"/v1/chat/completions",{method:"POST",headers})).status).toBe(405);
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));r.close();}
  });
});
