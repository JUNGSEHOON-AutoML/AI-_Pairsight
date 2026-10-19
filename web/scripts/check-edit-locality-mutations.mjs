// Mutate disposable copies only, never the checkout. Requires cached DINO weights.
// Run from web/: node scripts/check-edit-locality-mutations.mjs [--json path]
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), 'pairsight-edit-mutations-'));
const original = await readFile(join(root, 'lib/verification/edit-locality.ts'), 'utf8');
const verdict = await readFile(join(root, 'lib/verdict.ts'), 'utf8');
const rows = [];
const mutations = [
  ['baseline', original],
  ['all guards disabled', original.replace('  return typeof residual', '  return true;\n  return typeof residual')],
  ['residual guard disabled', original.replace('residual <= limits.maxOutsideResidual', 'true')],
  ['area guard disabled', original.replace('area <= limits.maxDiffAreaFraction', 'true')],
  ['count guard disabled', original.replace('count <= limits.maxDiffRegionCount', 'true')],
  ['v2 ambiguity veto removed', original, verdict.replace('if (ambiguousComparison(matches, limits)) return done', 'if (false) return done')],
];
try {
  for (const p of ['lib', 'config', 'tests/fixtures', 'public/fixtures']) await cp(join(root, p), join(scratch, p), { recursive: true });
  for (const p of ['package.json', 'tsconfig.json', 'tests/edit-locality.test.ts']) { await mkdir(join(scratch, p, '..'), { recursive: true }); await cp(join(root, p), join(scratch, p)); }
  await symlink(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  for (const [name, content, verdictContent = verdict] of mutations) {
    await writeFile(join(scratch, 'lib/verification/edit-locality.ts'), content);
    await writeFile(join(scratch, 'lib/verdict.ts'), verdictContent);
    const report = join(scratch, 'report.json');
    await rm(report, { force: true });
    const run = spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/edit-locality.test.ts', '--reporter=json', `--outputFile=${report}`], {
      cwd: scratch, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
      env: { ...process.env, PAIRSIGHT_MOCK_DELAY_MS: '0', PAIRSIGHT_MODEL_CACHE: process.env.PAIRSIGHT_MODEL_CACHE ?? join(root, '.cache/models') },
    });
    if (run.error) throw run.error;
    let json;
    try { json = JSON.parse(await readFile(report, 'utf8')); }
    catch { throw new Error(`Mutation runner failed without a test report: ${name}\n${run.stderr}`); }
    const failed = json.testResults.flatMap(r => r.assertionResults.filter(a => a.status === 'failed').map(a => a.fullName));
    if (name === 'baseline' ? run.status !== 0 || failed.length : run.status === 0 || !failed.length) throw new Error(`Unexpected mutation result: ${name}: ${run.status}, ${failed.length} failed tests`);
    if (name === 'all guards disabled' && !failed.some(n => n.includes('same place at different times'))) throw new Error('The real-pixel counterexample did not kill the all-off mutation');
    rows.push({ mutation: name, result: name === 'baseline' ? 'pass' : 'killed', failedTests: failed });
    console.log(`${name}: ${rows.at(-1).result} (${failed.length} failed assertions)`);
  }
  const arg = process.argv.indexOf('--json');
  if (arg !== -1) await writeFile(resolve(process.argv[arg + 1]), JSON.stringify({ description: 'Disposable source mutations; baseline must pass, each mutation must fail assertions, not infrastructure.', rows }, null, 2) + '\n');
} finally { await rm(scratch, { recursive: true, force: true }); }
