// Run against a separate local mock server. Creates and deletes its own test account.
// Requires Playwright, or PAIRSIGHT_PLAYWRIGHT_MODULE pointing to an existing installation.
const { chromium } = require(process.env.PAIRSIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const baseURL = process.env.PAIRSIGHT_BASE_URL || 'http://127.0.0.1:3100';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname), 'Run only against a local, disposable mock server');
const root = path.resolve(__dirname, '../..');
const screenshotDir = path.join(root, 'replica/clone-screens/stage4-account');
const errors = [];
const results = [];
const loginEmail = `takeover-${Date.now()}@example.test`;
const passed = (name) => { results.push(name); console.log('PASS', name); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(page, pathname, options = {}) {
  return page.evaluate(async ({ pathname, options }) => {
    const res = await fetch(pathname, options);
    return { status: res.status, body: await res.json() };
  }, { pathname, options });
}

async function upload(page, claimedDate = null) {
  const response = await page.evaluate(async (claimedDate) => {
    const blob = await (await fetch('/fixtures/inputs/authentic.png')).blob();
    const form = new FormData();
    form.set('file', new File([blob], 'authentic.png', { type: 'image/png' }));
    if (claimedDate) form.set('claimedDate', claimedDate);
    const res = await fetch('/api/checks', { method: 'POST', body: form });
    return { status: res.status, body: await res.json() };
  }, claimedDate);
  assert.equal(response.status, 201);
  return response.body.id;
}

async function result(page, id) {
  for (let n = 0; n < 100; n++) {
    const response = await request(page, `/api/checks/${id}`);
    assert.equal(response.status, 200);
    if (response.body.status === 'done') return response.body;
    assert.notEqual(response.body.status, 'failed');
    await pause(100);
  }
  throw new Error('analysis timed out');
}

async function login(page) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('이메일', { exact: true }).fill(loginEmail);
  await page.getByRole('button', { name: '로그인 링크 받기' }).click();
  const link = page.getByRole('link', { name: '로그인 링크 열기' });
  await link.waitFor();
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForURL('**/history?welcome=1');
  assert.equal(new URL(page.url()).origin, baseURL);
  await page.getByRole('status').filter({ hasText: '로그인했어요' }).waitFor();
  return href;
}

(async () => {
  await mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PAIRSIGHT_BROWSER_EXECUTABLE || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL });
    const owner = await desktop.newPage();
    const visitor = await mobile.newPage();
    for (const page of [owner, visitor]) {
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
      await page.goto(baseURL);
      await page.getByText('개발용 모의 데이터', { exact: true }).waitFor();
    }
    await owner.goto(`${baseURL}/dev/fixtures`);
    await owner.locator('[data-scenario="authentic"]').click();
    await owner.waitForURL('**/check/*');
    const ownedId = new URL(owner.url()).pathname.split('/').pop();
    await result(owner, ownedId);
    await login(owner);
    passed('fixture upload and first sign-in preserve the original check');

    const anonId = await upload(visitor);
    const datedId = await upload(visitor, '2026-10-01');
    const original = await result(visitor, anonId);
    const dated = await result(visitor, datedId);
    assert.equal(original.analysisId, dated.analysisId);
    assert.equal(original.verdict, 'authentic');
    assert.equal(dated.verdict, 'inconclusive');
    const retiredState = await mobile.storageState();
    passed('shared evidence gives different verdicts for different claimed dates');

    const consumedLink = await login(visitor);
    const history = (await request(visitor, '/api/history')).body.items;
    assert.deepEqual(history.map((c) => c.id).sort(), [ownedId, anonId, datedId].sort());
    assert.deepEqual((await request(visitor, '/api/me')).body.usage, { used: 3, limit: 10 });
    for (const item of history) {
      const status = await visitor.evaluate(async (url) => (await fetch(url)).status, item.imageUrl);
      assert.equal(status, 200);
    }
    passed('existing-account login merges three checks, their uploads and daily usage');

    const retired = await browser.newContext({ storageState: retiredState });
    const denied = await retired.request.get(`${baseURL}/api/checks/${anonId}`);
    assert.equal(denied.status(), 404);
    await retired.close();
    passed('retired anonymous session loses access to transferred records');

    const retry = await request(visitor, `/api/checks/${datedId}/recheck`, { method: 'POST' });
    assert.equal(retry.status, 201);
    const fresh = await result(visitor, retry.body.id);
    assert.notEqual(fresh.analysisId, dated.analysisId);
    assert.equal(fresh.claimedDate, '2026-10-01');
    assert.equal(fresh.verdict, 'inconclusive');
    passed('rechecking a transferred image creates a new analysis with its claimed date intact');

    for (const [page, size] of [[owner, '1440'], [visitor, '390']]) {
      await page.goto(`${baseURL}/history?welcome=1`);
      await page.reload();
      await page.locator('main li').nth(3).waitFor();
      assert.equal(await page.locator('main li').count(), 4);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: path.join(screenshotDir, `history-${size}.png`), fullPage: true });
    }
    passed('merged history renders at 1440px and 390px without horizontal overflow');

    await visitor.goto(new URL(consumedLink, baseURL).href);
    assert(new URL(visitor.url()).searchParams.get('error') === 'expired');
    passed('reusing a consumed magic link is rejected');

    const deletion = await request(visitor, '/api/account', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: '삭제합니다' }),
    });
    assert.equal(deletion.status, 200);
    assert.deepEqual((await request(owner, '/api/history')).body.items, []);
    const image = await desktop.request.get(`${baseURL}/api/checks/${anonId}/image`);
    assert.equal(image.status(), 404);
    passed('deleting the account removes transferred history and image access');
    assert.deepEqual(errors, []);
    passed('no browser console errors or page errors');
    await writeFile(path.join(screenshotDir, 'verification.json'), JSON.stringify({ results, errors, viewports: [1440, 390] }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
