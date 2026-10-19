// Local disposable mock server only. Run from web/ with PAIRSIGHT_PLAYWRIGHT_MODULE set if needed.
const { chromium } = require(process.env.PAIRSIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const baseURL = process.env.PAIRSIGHT_BASE_URL || 'http://127.0.0.1:3102';
assert(['127.0.0.1','localhost'].includes(new URL(baseURL).hostname));
const dir = path.resolve(__dirname, '../clone-screens/stage4');
const pause = ms => new Promise(r => setTimeout(r, ms));
const scenarios = { authentic:'authentic', ai_generated:'ai_generated', edited:'edited', miscontextualized:'miscontextualized', inconclusive:'inconclusive', no_source:'inconclusive', fact_check_found:'inconclusive', provider_timeout:null };
(async () => {
  await mkdir(dir,{recursive:true}); const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const errors=[], results=[];
  try {
    for(const width of [1440,390]) for(const [name, expected] of Object.entries(scenarios)) {
      const ctx=await browser.newContext({viewport:{width,height:960},baseURL}); const page=await ctx.newPage();
      page.on('pageerror',e=>errors.push(e.message)); page.on('console',e=>{ if(e.type()==='error') errors.push(e.text()); });
      await page.goto('/dev/fixtures'); await page.locator(`[data-scenario="${name}"]`).click(); await page.waitForURL('**/check/*');
      const id=new URL(page.url()).pathname.split('/').pop(); let result;
      for(let n=0;n<150;n++) { result=await page.evaluate(async id => (await fetch(`/api/checks/${id}`)).json(), id); if(['done','failed'].includes(result.status)) break; await pause(100); }
      assert.equal(result.status,expected?'done':'failed'); assert.equal(result.verdict,expected);
      await page.getByText('개발용 모의 데이터',{exact:true}).waitFor();
      if(expected) await page.getByText(result.reason,{exact:true}).waitFor(); else await page.getByText('분석하지 못했어요',{exact:true}).waitFor();
      if(name==='fact_check_found') { await page.getByRole('heading',{name:'기존 팩트체크 결과'}).waitFor(); assert(result.verification.factChecks[0].verified); }
      if(name==='edited') { await page.getByText('정렬 후 차이 히트맵',{exact:true}).click(); assert(result.matches[0].comparison.diffRegions.length>0); }
      if(name==='miscontextualized') assert.equal(result.evidence.filter(e=>e.kind==='context').length,3);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${name} ${width}`);
      const status=await page.evaluate(async id => (await fetch(`/api/checks/${id}/image`)).status, id); assert.equal(status,200);
      const meta=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return [img.naturalWidth,img.naturalHeight];}, `/api/checks/${id}/image`); assert(Math.max(...meta)<=512);
      await page.screenshot({path:path.join(dir,`${name}-${width}.png`),fullPage:true});
      await page.evaluate(()=>fetch('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:'삭제합니다'})})); await ctx.close();
      results.push(`${name} ${width}: ${result.status}/${result.verdict}`); console.log('PASS',results.at(-1));
    }
    // Actual URL picker and claim form, with one mock article page.
    const ctx=await browser.newContext({baseURL});const page=await ctx.newPage(); await page.goto('/');
    await page.getByRole('textbox',{name:/유포 주장/}).fill('이 사진은 2026년 서울 홍수 현장이다.');
    await page.locator('input[type="url"]').fill('https://demo.pairsight.test/news/miscontextualized');
    await page.getByRole('button',{name:'이미지 찾기'}).click();
    await page.getByRole('button',{name:/이 이미지 검사/}).first().click(); await page.waitForURL('**/check/*');
    await page.getByText('같은 이미지·같은 주장에 대해, 확인한 팩트체크 원문이 맥락 불일치를 설명해요.',{exact:true}).waitFor();
    results.push('URL input + claim → miscontextualized'); await page.evaluate(()=>fetch('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:'삭제합니다'})})); await ctx.close();
    assert.deepEqual(errors,[]); await writeFile(path.join(dir,'verification.json'),JSON.stringify({results,errors},null,2)+'\n');
    console.log(`PASS ${results.length} browser scenarios, zero console errors`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
