// Reproducible synthetic calibration; these are not real-photo accuracy estimates.
import { readFile, writeFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
const signal = () => AbortSignal.timeout(180000);
const comparer = new LocalImageComparisonProvider();
const rows: Record<string, unknown>[] = [];
async function measure(name: string, a: Uint8Array, b: Uint8Array) {
  const c = await comparer.compare(a, b, signal());
  rows.push({ name, sceneSimilarity: c.sceneSimilarity, matched: c.matched, alignment: c.alignmentScore,
    changedFraction: c.changedFraction, outsideResidual: c.outsideResidual, diffAreaFraction: c.diffAreaFraction, diffRegionCount: c.diffRegionCount });
}
async function main() {
const source = await readFile('tests/fixtures/comparison/original.png');
const samples = [['comparison', source], ...await Promise.all((await readdir('public/fixtures/scenes')).filter(f => f.endsWith('.png')).sort().map(async f => [f, await readFile('public/fixtures/scenes/' + f)] as const))] as const;
for (const [name, bytes] of samples) for (const quality of [60, 70, 82, 90]) {
  await measure(`jpeg-${name}-q${quality}`, await sharp(bytes).jpeg({ quality }).toBuffer(), bytes);
}
for (const name of ['edited', 'trusted_edited']) {
  await measure(name, await readFile(`public/fixtures/inputs/${name}.png`), await readFile(`public/fixtures/originals/${name}.png`));
}
await measure('rectangle-edit', await readFile('tests/fixtures/comparison/edited.png'), source);
const a = await readFile('tests/fixtures/temporal/street-morning.png'), b = await readFile('tests/fixtures/temporal/street-later.png');
await measure('same-place-later', b, a);
await measure('same-place-earlier', a, b);
await writeFile('tests/fixtures/temporal/calibration.json', JSON.stringify({ version: 1, description: 'Synthetic drawings only; RGB residual normalized to 0..1, DINOv2-small q8 at scene gate 0.76.', rows }, null, 2) + '\n');
const controls = rows.filter(r => String(r.name).startsWith('jpeg'));
console.log(JSON.stringify({ jpegPairs: controls.length, maximumJpegOutsideResidual: Math.max(...controls.map(r => Number(r.outsideResidual))), others: rows.filter(r => !String(r.name).startsWith('jpeg')) }, null, 2));

}
main().catch(e => { console.error(e); process.exitCode = 1; });
