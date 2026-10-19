import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseRepository } from "../lib/newsroom/repository";
import { liveSnapshot, newsroomStream } from "../lib/newsroom/live";
import { viewerTarget } from "../lib/newsroom/viewer-proxy";
import type { CaseInput } from "../lib/newsroom/model";
const input:CaseInput={origin:"manual",claim:"확인할 주장",claimedDate:null,pageUrl:null,imageUrl:null,thumbnail:"DO_NOT_STREAM_IMAGE",imageHash:null,provenance:[],candidateUrls:[],channels:[],topic:"society",contentFlags:[],rightsConfirmed:false,reportedBy:"DO_NOT_STREAM_OPERATOR"};
const stores:CaseRepository[]=[];const store=(path=":memory:")=>{const r=new CaseRepository(path);stores.push(r);return r;};
afterEach(()=>stores.splice(0).forEach(r=>r.close()));
const read=async(reader:ReadableStreamDefaultReader<Uint8Array>)=>new TextDecoder().decode((await reader.read()).value);
describe("unified operator live view",()=>{
  it("streams a running or failed court before a verdict exists",()=>{
    const r=store(),c=r.create(input);
    r.mutate(c.id,x=>{x.stage="factcheck";x.status="running";x.sections.factcheck={department:"factcheck",state:"running",attempt:1,startedAt:new Date().toISOString(),finishedAt:null,durationMs:null,data:{},error:null};});
    expect(liveSnapshot(r).cases[0].verdict).toBeNull();expect(liveSnapshot(r).room.departments[4].state).toBe("working");
    r.mutate(c.id,x=>{x.status="failed";x.sections.factcheck!.state="failed";});
    expect(liveSnapshot(r).cases[0].verdict).toBeNull();expect(liveSnapshot(r).room.departments[4].state).toBe("blocked");
  });
  it("excludes fixtures, private images, run tokens and unapproved publication drafts",()=>{
    const r=store(),c=r.create(input);r.create({...input,origin:"fixture"});
    r.mutate(c.id,x=>{x.stage="osint";x.status="running";x.run={token:"DO_NOT_STREAM_TOKEN",expiresAt:Date.now()+10000};x.publicCase={truthTitle:"DO_NOT_STREAM_DRAFT"} as never;});
    const s=liveSnapshot(r);expect(s.cases).toHaveLength(1);expect(s.cases[0].published).toBeNull();expect(s.room.departments[1].state).toBe("working");
    expect(JSON.stringify(s)).not.toContain("DO_NOT_STREAM");
  });
  it("observes commits from another worker connection and closes on abort",async()=>{
    const dir=mkdtempSync(join(tmpdir(),"newsroom-live-"));
    const r=new CaseRepository(join(dir,"cases.sqlite")),writer=new CaseRepository(join(dir,"cases.sqlite"));
    const abort=new AbortController(),reader=newsroomStream(r,()=>true,abort.signal,5).getReader();
    try {
      expect(await read(reader)).toContain('"cases":[]');expect(await read(reader)).toContain("heartbeat");
      const c=writer.create(input);expect(await read(reader)).toContain(c.id);
      // No event emitted: revision changes must still be pushed (e.g. review or failure).
      writer.mutate(c.id,x=>{x.stage="osint";x.status="failed";});expect(await read(reader)).toContain('"state":"blocked"');
      abort.abort();expect((await reader.read()).done).toBe(true);
    }finally{abort.abort();writer.close();r.close();rmSync(dir,{recursive:true,force:true});}
  });
  it("stops leaking updates after a session is revoked",async()=>{
    const r=store();let allowed=true;
    const reader=newsroomStream(r,()=>allowed,new AbortController().signal,5).getReader();
    await read(reader);await read(reader);allowed=false;r.create(input);
    const message=await read(reader);expect(message).toContain("expired");expect(message).not.toContain(input.claim);expect((await reader.read()).done).toBe(true);
  });
  it("does not project private data for an invalid session, and supports reader cancellation",async()=>{
    const r=store();r.create(input);
    const denied=newsroomStream(r,()=>false,new AbortController().signal,5).getReader();
    expect(await read(denied)).toBe('event: expired\ndata: {}\n\n');expect((await denied.read()).done).toBe(true);
    const reader=newsroomStream(r,()=>true,new AbortController().signal,5).getReader();await read(reader);await expect(reader.cancel()).resolves.toBeUndefined();
  });
  it("allows only namespaced viewer HTML and static assets at a fixed loopback port",()=>{
    expect(viewerTarget(["newsroom"],"3460")).toBe("http://127.0.0.1:3460/controlroom/newsroom");
    expect(viewerTarget(["_next","static","chunks","a.js"],"3460")).not.toBeNull();
    for(const path of [["api","newsroom"],["api","runtime"],["_next","static","..","api"],["_next","static","%2e%2e"],["newsroom?url=evil"],["newsroom/../api"],["newsroom\\api"],[]])expect(viewerTarget(path)).toBeNull();
    for(const port of ["3000","https://evil.example","3460@evil","0","65536"])expect(viewerTarget(["newsroom"],port)).toBeNull();
  });
});
