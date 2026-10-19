// Uses the separately installed Claw3D. Never installs an agent runtime.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const claw = resolve(process.env.CLAW3D_DIR || join(homedir(), 'claw3d'));
if (!(await readFile(join(claw, 'server/studio-settings.js'), 'utf8')).includes('CLAW3D_GATEWAY_ENV_ONLY')) throw new Error('Apply replica/integrations/claw3d-viewer.patch and build Claw3D first.');
const token = process.env.PAIRSIGHT_CONTROLROOM_TOKEN || randomBytes(32).toString('hex');
if (!/^[A-Za-z0-9_-]{24,}$/.test(token)) throw new Error('Control-room token must be 24+ URL-safe characters.');
const port = (name, fallback) => {
  const n = Number(process.env[name] || fallback);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`Invalid ${name}`);
  return n;
};
const uiPort = port('PAIRSIGHT_CLAW3D_PORT', 3400), httpPort = port('PAIRSIGHT_CONTROLROOM_PORT', 3410), wsPort = port('PAIRSIGHT_CONTROLROOM_WS_PORT', 3411);
if (new Set([3000, uiPort, httpPort, wsPort]).size !== 4) throw new Error('Use distinct ports other than Pairsight port 3000.');
const stateDir = await mkdtemp(join(tmpdir(), 'pairsight-claw3d-'));
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? undefined : new Promise(r => child.once('exit', r))));
  await rm(stateDir, { recursive: true, force: true });
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
function start(args, cwd, env, input) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: [input, 'inherit', 'inherit'] });
  children.push(child);
  child.once('error', err => { console.error(err.message); void stop(1); });
  child.once('exit', code => { if (!stopping) void stop(code ?? 1); });
}
start(['server/index.js'], claw, {
  PORT: String(uiPort), HOST: '127.0.0.1', HOSTS: '127.0.0.1', OPENCLAW_STATE_DIR: stateDir,
  CLAW3D_GATEWAY_ENV_ONLY: '1', CLAW3D_GATEWAY_ADAPTER_TYPE: 'demo',
  CLAW3D_GATEWAY_URL: `ws://127.0.0.1:${wsPort}`, CLAW3D_GATEWAY_TOKEN: token,
  UPSTREAM_ALLOWLIST: '127.0.0.1,localhost',
}, 'ignore');
start(['--import', join(web, 'node_modules/tsx/dist/loader.mjs'), join(web, 'scripts/controlroom-demo.ts'), '--wait-for-enter', ...process.argv.slice(2)], web, {
  PAIRSIGHT_CONTROLROOM_TOKEN: token, PAIRSIGHT_CONTROLROOM_PORT: String(httpPort), PAIRSIGHT_CONTROLROOM_WS_PORT: String(wsPort),
}, 'inherit');
console.log(`운영자 관제실: http://127.0.0.1:${uiPort} (보기 전용, 토큰은 출력·저장하지 않음)`);
