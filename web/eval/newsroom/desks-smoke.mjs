// Browser integration test. Uses a disposable database copy and its own viewer; never mutates live cases.
import {createRequire} from "node:module";
import {mkdtemp,writeFile,copyFile,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {randomBytes,scryptSync,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {CaseRepository} from "../../lib/newsroom/repository.ts";
import {migrateLegacyReports} from "../../lib/newsroom/legacy-reports.ts";
import {writeBriefing} from "../../lib/newsroom/briefing.ts";
const web=process.cwd(),claw=process.env.CLAW3D_DIR;if(!claw)throw Error("CLAW3D_DIR required");
const {chromium,expect}=createRequire(join(claw,"package.json"))("@playwright/test");
const dir=await mkdtemp(join(tmpdir(),"pairsight-unified-")),db=join(dir,"cases.sqlite"),users=join(dir,"operators.json");
const password=randomBytes(24).toString("hex"),salt=randomBytes(16).toString("hex");
await copyFile(join(web,".newsroom","cases.sqlite"),db);
await writeFile(users,JSON.stringify([{id:"browser-test-only",salt,digest:scryptSync(password,salt,64).toString("hex")}]),{mode:0o600});
process.env.PAIRSIGHT_NEWSROOM_ROOT=join(dir,"newsroom");
const repo=new CaseRepository(db);migrateLegacyReports(repo);
await writeBriefing(repo,"daily",undefined,{llm:{name:"browser-test",generate:async req=>({text:JSON.stringify({order:JSON.parse(req.prompt.replace(/^<desk_report>|<\/desk_report>$/g,"")).facts.map(f=>f.id)}),stats:{totalMs:0,loadMs:0,promptTokens:0,outputTokens:0}})}});
const testCase=repo.list().find(c=>c.status==="awaiting_approval");assert(testCase,"isolated copy needs a pending case");
// Fixture never appears in either live dashboard or the 3D scene, even if present in the database.
repo.create({...testCase.input,origin:"fixture",claim:"HIDDEN_TEST_FIXTURE"});
const port=Number(process.env.NEWSROOM_TEST_PORT??3012),viewerPort=Number(process.env.NEWSROOM_TEST_VIEWER_PORT??3462),base="http://127.0.0.1:"+port;
const children=[];
const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"production"};
const start=(args,cwd,extra)=>{const child=spawn(process.execPath,args,{cwd,env:{...env,...extra},stdio:"ignore"});children.push(child);return child;};
start(["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],web,{PAIRSIGHT_CASE_DB:db,PAIRSIGHT_NEWSROOM_ROOT:join(dir,"newsroom"),PAIRSIGHT_OPERATOR_FILE:users,PAIRSIGHT_CLAW3D_PORT:String(viewerPort)});
start(["server/newsroom.js"],claw,{CLAW3D_NEWSROOM_MODE:"1",PORT:String(viewerPort),PAIRSIGHT_CONTROLROOM_TOKEN:randomBytes(32).toString("base64url")});
const output=resolve(process.env.NEWSROOM_SCREEN_DIR??"../replica/clone-screens/five-desks");await mkdir(output,{recursive:true});
let browser;
try {
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+"/api/operator/session")).ok&&(await fetch(`http://127.0.0.1:${viewerPort}/controlroom/newsroom`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert(ready,"test servers ready");console.log("Test servers ready");
  for(const path of ["/api/operator/live","/controlroom/newsroom","/controlroom/_next/static/chunks/example.js"])assert.equal((await fetch(base+path)).status,401);
  assert.equal((await fetch(base+"/controlroom/newsroom",{method:"POST"})).status,405);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],failedAssets=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.url().includes("/controlroom/_next/")&&r.status()>=400)failedAssets.push(r.status());});
  await page.goto(base+"/newsroom");await page.waitForURL("**/newsroom/login");
  await page.getByLabel("운영자 ID").fill("browser-test-only");await page.getByLabel("비밀번호",{exact:true}).fill(password);
  await page.getByRole("button",{name:"편집국 로그인"}).click();await page.waitForURL(base+"/newsroom");
  console.log("Operator login passed");await page.getByRole("heading",{name:"편집장에게 듣는 오늘의 소식"}).waitFor();await page.getByText("● 실시간 연결",{exact:true}).waitFor();
  const frame=page.frameLocator('iframe[title="실시간 3D 편집국"]');await frame.locator("[data-room]").first().waitFor({timeout:60000});
  console.log("Embedded viewer ready");await expect(frame.locator("[data-room]")).toHaveCount(7);assert.equal(await frame.locator("canvas").count(),1);
  assert.equal(await page.getByText("HIDDEN_TEST_FIXTURE").count(),0);
  assert.equal(await page.locator("iframe").getAttribute("src"),"/controlroom/newsroom");
  assert.equal(await page.locator(".nw-case-card").count(),repo.list().length);
  const sidebar=await page.locator(".nw-dashboard").boundingBox(),office=await page.locator(".nw-office").boundingBox();assert(sidebar.x+sidebar.width<=office.x+1,"dashboard is left of office");
  await page.locator(`[data-case-id="${testCase.id}"]`).click();
  await frame.locator('[data-room="review"][aria-pressed="true"]').waitFor();
  await frame.locator('[data-room="research"]').click();await frame.locator('[data-room="research"][aria-pressed="true"]').waitFor();
  await page.locator(`[data-case-id="${testCase.id}"]`).click();
  await page.screenshot({path:join(output,"unified-1440.png"),fullPage:true});
  // An actual repository commit in the isolated copy must update both views through the same stream.
  const started=Date.now();repo.mutate(testCase.id,(c,emit)=>{c.stage="osint";c.status="running";emit({department:"osint",state:"running",summary:"격리 브라우저 검증: OSINT 시작",cite:[]});});
  await frame.locator('[data-room="research"][data-activity="working"][aria-pressed="true"]').waitFor();
  const liveLatencyMs=Date.now()-started;console.log("Live working state passed");
  await page.locator(".editor-selected").getByText("확인 중",{exact:true}).waitFor();
  await page.waitForTimeout(1200);await page.screenshot({path:join(output,"isolated-working-1440.png"),fullPage:true});
  const beforeMotion=await frame.locator("canvas").screenshot();await page.waitForTimeout(400);const afterMotion=await frame.locator("canvas").screenshot();
  assert.notEqual(createHash("sha256").update(beforeMotion).digest("hex"),createHash("sha256").update(afterMotion).digest("hex"),"working agent visibly animates");
  repo.mutate(testCase.id,(c,emit)=>{c.stage="ai_data";c.status="running";emit({department:"ai_data",state:"running",summary:"격리 브라우저 검증: AI 비교 시작",cite:[]});});
  await frame.locator('[data-room="research"][data-activity="working"][aria-pressed="true"]').waitFor();
  repo.mutate(testCase.id,(c,emit)=>{c.status="failed";emit({department:"ai_data",state:"failed",summary:"격리 브라우저 검증: 작업 중단",cite:[]});});
  await frame.locator('[data-room="research"][data-activity="idle"][data-state="blocked"]').waitFor();
  // Only a new completed report triggers staff document delivery.
  repo.mutate(testCase.id,(c,emit)=>{emit({department:"ai_data",desk:"research",action:"report_completed",state:"done",summary:"격리 시험 보고서 완료",cite:[]});});
  await frame.locator('[data-room="research"][data-delivery]:not([data-delivery=""])').waitFor();
  const deliveryBefore=await frame.locator("canvas").screenshot();await page.waitForTimeout(350);const deliveryAfter=await frame.locator("canvas").screenshot();assert.notEqual(createHash("sha256").update(deliveryBefore).digest("hex"),createHash("sha256").update(deliveryAfter).digest("hex"));
  repo.mutate(testCase.id,(c,emit)=>{emit({department:"reliability",desk:"editor",action:"briefing_completed",state:"done",summary:"격리 시험 브리핑 완료",cite:[]});});
  await frame.locator('[data-room="editor"][data-delivery]:not([data-delivery=""])').waitFor();
  repo.mutate(testCase.id,c=>{Object.assign(c,testCase);});
  await page.setViewportSize({width:390,height:844});await page.locator("iframe").scrollIntoViewIfNeeded();await page.waitForTimeout(2000);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"mobile overflow");
  assert(await frame.locator("body").evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"iframe mobile overflow");
  const visibleRooms=await frame.locator("[data-room]").evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.x+r.width/2>0&&r.x+r.width/2<innerWidth&&r.y+r.height/2>0&&r.y+r.height/2<innerHeight;}).length);assert.equal(visibleRooms,7);
  await page.screenshot({path:join(output,"five-desks-390.png"),fullPage:true});
  await page.goto(base+"/newsroom/"+testCase.id);await expect(page.locator(".report-stack>section.report-sheet")).toHaveCount(5);assert.equal(await page.locator("pre").count(),0);await page.getByRole("button",{name:"검토 완료 · 게재 승인"}).waitFor();await page.screenshot({path:join(output,"reports-390.png"),fullPage:true});
  // Visitor workflow: two required fields and no operator session or private UUID access.
  const guest=await browser.newContext({viewport:{width:390,height:844}}),publicPage=await guest.newPage();await publicPage.goto(base+"/check");await publicPage.getByRole("button",{name:"URL",exact:true}).click();assert.equal(await publicPage.locator("[required]").count(),2);await publicPage.getByLabel("확인할 URL").fill("https://example.org/report");await publicPage.getByLabel("2. 무엇이 궁금한가요?").fill("이 기사 사진의 출처가 궁금해요");await publicPage.screenshot({path:join(output,"visitor-390.png"),fullPage:true});await publicPage.getByRole("button",{name:"확인 요청하기"}).click();await publicPage.waitForURL("**/check/*");await publicPage.getByRole("heading",{name:"확인 중",exact:true}).waitFor();assert(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const submitted=publicPage.url().split("/").at(-1);assert.equal((await publicPage.request.get(base+"/api/submissions/"+submitted)).status(),200);assert.equal((await fetch(base+"/api/submissions/"+submitted)).status,404);assert.equal((await publicPage.request.get(base+"/api/operator/live")).status(),401);await guest.close();
  await page.goto(base+"/newsroom");
  // Revocation must close the stream even though the page itself has not navigated.
  repo.db.exec("DELETE FROM operator_sessions");await page.waitForURL("**/newsroom/login");
  assert.equal((await page.request.get(base+"/controlroom/newsroom")).status(),401);
  assert.equal(errors.length,0,"browser exceptions");assert.equal(failedAssets.length,0,"same-origin Claw assets");
  const result={singleOrigin:true,leftBriefing:true,rooms:7,reports:5,jsonHidden:true,approvalBesideReview:true,liveLatencyMs,reportDelivery:true,editorDelivery:true,visibleAnimation:true,visitorTwoRequiredInputs:true,privateOwnerOnly:true,fixturesHidden:true,anonymousBlocked:true,logoutRevoked:true,mobileOverflow:false,browserErrors:errors.length,assetErrors:failedAssets.length,productionUnchanged:true};
  await writeFile(join(output,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));
}catch(error){
  console.error("Unified browser check failed",error.message);
  const page=browser?.contexts()[0]?.pages()[0];
  if(page){await page.screenshot({path:join(output,"failure.png"),fullPage:true}).catch(()=>{});console.error("Visible frames:",page.frames().map(f=>new URL(f.url()||base).pathname));}
  throw error;
}finally{
  await browser?.close();for(const c of children)c.kill("SIGTERM");
  await Promise.all(children.map(c=>new Promise(resolve=>{if(c.exitCode!==null||c.signalCode!==null){resolve();return;}const timer=setTimeout(()=>c.kill("SIGKILL"),5000);c.once("exit",()=>{clearTimeout(timer);resolve();});})));
  repo.close();await rm(dir,{recursive:true,force:true});
}
