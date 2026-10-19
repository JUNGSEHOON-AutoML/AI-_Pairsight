// Run from web after building the separately installed, patched Claw3D.
// No external API calls: actual mock court → WS adapter → Claw3D proxy → production 3D UI.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const claw = resolve(process.env.CLAW3D_DIR || join(homedir(), 'claw3d'));
const { chromium } = createRequire(join(claw, 'package.json'))('playwright');
const output = resolve(process.env.CONTROLROOM_SMOKE_OUTPUT || join(web, '../replica/clone-screens/controlroom/verified'));
await mkdir(output, { recursive: true });
const token = randomBytes(32).toString('hex'), studio = randomBytes(32).toString('hex');
const uiPort = process.env.PAIRSIGHT_CLAW3D_PORT || '3440';
const base = `http://127.0.0.1:${uiPort}`;
let log = '', done = false;
const child = spawn(process.execPath, ['scripts/controlroom-claw3d.mjs', '--step-ms', '1800', '--frame-gap-ms', '250'], {
  cwd: web, env: { ...process.env, CLAW3D_DIR: claw, STUDIO_ACCESS_TOKEN: studio, PAIRSIGHT_CONTROLROOM_TOKEN: token,
    PAIRSIGHT_CLAW3D_PORT: uiPort, PAIRSIGHT_CONTROLROOM_PORT: process.env.PAIRSIGHT_CONTROLROOM_PORT || '3450',
    PAIRSIGHT_CONTROLROOM_WS_PORT: process.env.PAIRSIGHT_CONTROLROOM_WS_PORT || '3451' }, stdio: ['pipe', 'pipe', 'pipe'],
});
child.stdout.on('data', b => { log += b.toString(); if (log.includes('마지막 상태를 계속')) done = true; });
child.stderr.on('data', b => { log += b.toString(); });
let browser;
try {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error('Launcher exited before startup');
    try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: 'studio_access', value: studio, url: base }]);
  const page = await context.newPage();
  // Keep this GPU-less server responsive; no fake gateway frames or verdicts are injected in the browser.
  await page.addInitScript(() => {
    localStorage.setItem('claw3d:onboarding:completed', 'true');
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => setTimeout(() => cb(t), 150));
  });
  const errors = [], frames = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
    const frame = JSON.parse(String(payload));
    if (frame.type === 'event' && ['agent', 'chat', 'presence'].includes(frame.event)) frames.push(frame);
  }));
  await page.goto(base);
  await page.waitForFunction(() => /\b7\s+AGENTS\b/.test(document.body.innerText), {}, { timeout: 60_000 });
  await page.screenshot({ path: join(output, 'ready.png') });
  child.stdin.write('\n');
  await page.waitForFunction(() => /\b[1-7] working\b/.test(document.body.innerText), {}, { timeout: 60_000 });
  await page.screenshot({ path: join(output, 'working.png') });
  for (let i = 0; i < 60 && !done; i++) await new Promise(r => setTimeout(r, 1000));
  assert(done, 'court must finish');
  await page.waitForFunction(() => document.body.innerText.includes('0 working') && document.body.innerText.includes('7 idle'), {}, { timeout: 60_000 });
  await page.screenshot({ path: join(output, 'finished.png') });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const started = new Set(frames.filter(f => f.event === 'agent' && f.payload.data.phase === 'start').map(f => f.payload.sessionKey));
  assert.equal(started.size, 7);
  const speech = frames.filter(f => f.event === 'chat' && f.payload.state === 'final').map(f => f.payload.message.content);
  assert(speech.some(s => s.includes('E1') && s.includes('S1')));
  const settings = await page.request.get(base + '/api/studio');
  assert(!(await settings.text()).includes(token), 'public settings must redact credential');
  const result = { courtEvents: (log.match(/^\[\d+\]/gm) || []).length, seatsStarted: started.size, finalSpeeches: speech.length,
    finalWorking: 0, finalIdle: 7, pageErrors: errors, evidenceIdsSeen: ['E1', 'S1'], publicSettingsRedacted: true };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  if (child.exitCode === null && child.signalCode === null) await new Promise(r => child.once('exit', r));
  assert(!log.includes(token) && !log.includes(studio), 'credentials must not appear in logs');
}
