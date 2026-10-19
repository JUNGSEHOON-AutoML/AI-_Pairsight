// Measures the "same scene" gate on owned fixtures: pixel comparison result + DINOv2 similarity per pair.
// Run: npx tsx scripts/measure-scene-gate.ts [--json out.json]
// Same-scene pairs must stay above the threshold, different-scene pairs below it. Synthetic fixtures only:
// the numbers show separation on these images, not accuracy on real photographs.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { LocalImageComparisonProvider } from "../lib/verification/image-comparison";
import { DinoSceneGate, loadSceneModel, SCENE_MIN_SIMILARITY } from "../lib/verification/scene-gate";

const f = (p: string) => readFile(p).then((b) => new Uint8Array(b));
const scenes = ["night_city", "beach", "forest", "fruit_table", "mountain_lake", "aerial_fields", "studio_teapot", "studio_plant", "studio_vase", "studio_bicycle"];
const studio = (s: string) => s.startsWith("studio_");
const scene = (s: string) => f(`public/fixtures/scenes/${s}.png`);

async function variants(bytes: Uint8Array) {
  const img = sharp(bytes);
  const edit = Buffer.from('<svg width="170" height="150"><rect width="170" height="150" rx="12" fill="#1f7a4d"/><text x="20" y="90" font-size="44" fill="#fff" font-family="sans-serif">SOLD</text></svg>');
  return {
    "crop 75%": await img.clone().extract({ left: 100, top: 75, width: 600, height: 450 }).png().toBuffer(),
    "crop 60%": await img.clone().extract({ left: 160, top: 120, width: 480, height: 360 }).png().toBuffer(),
    flip: await img.clone().flop().png().toBuffer(),
    "colour": await img.clone().modulate({ brightness: 1.15, saturation: 0.6, hue: 20 }).png().toBuffer(),
    "jpeg 400px q55": await img.clone().resize(400).jpeg({ quality: 55 }).toBuffer(),
    "local edit": await img.clone().composite([{ input: edit, left: 560, top: 380 }]).png().toBuffer(),
    "local edit + jpeg": await sharp(await img.clone().composite([{ input: edit, left: 80, top: 80 }]).png().toBuffer()).resize(640).jpeg({ quality: 70 }).toBuffer(),
  };
}

async function main() {
  const t0 = performance.now();
  await loadSceneModel();
  const loadMs = performance.now() - t0;
  const gate = new DinoSceneGate();
  const pixels = new LocalImageComparisonProvider(null);
  const rows: { kind: "same" | "different" | "lookalike" | "template"; a: string; b: string; matched: boolean; regions: number; changed: number; sim: number }[] = [];
  const signal = AbortSignal.timeout(600_000);
  const add = async (kind: (typeof rows)[number]["kind"], a: string, b: string, x: Uint8Array, y: Uint8Array) => {
    const c = await pixels.compare(x, y, signal);
    rows.push({ kind, a, b, matched: c.matched, regions: c.diffRegions.length, changed: +c.changedFraction.toFixed(3), sim: +(await gate.similarity(x, y, signal)).toFixed(3) });
  };
  // same scene: transforms of each new scene, and the existing comparison / trusted / edited pairs
  for (const s of scenes) for (const [name, v] of Object.entries(await variants(await scene(s)))) await add("same", s, name, new Uint8Array(v), await scene(s));
  const cmp = "tests/fixtures/comparison/";
  for (const v of ["cropped.png", "flipped.png", "color.png", "compressed.jpg", "edited.png"]) await add("same", "comparison/original", v, await f(cmp + v), await f(cmp + "original.png"));
  for (const s of ["trusted_edited", "trusted_context", "edited", "authentic", "miscontextualized"]) {
    await add("same", `inputs/${s}`, `originals/${s}`, await f(`public/fixtures/inputs/${s}.png`), await f(`public/fixtures/originals/${s}.png`));
  }
  // different scenes: every pair of new scenes, and new scenes against the template
  for (let i = 0; i < scenes.length; i++) for (let j = i + 1; j < scenes.length; j++) await add(studio(scenes[i]) && studio(scenes[j]) ? "lookalike" : "different", scenes[i], scenes[j], await scene(scenes[i]), await scene(scenes[j]));
  for (const s of scenes) await add("different", s, "inputs/authentic", await scene(s), await f("public/fixtures/inputs/authentic.png"));
  // template scenes: same drawn layout, different colours / sign / extras (the fixtures that share one template)
  // ai_generated is drawn as its own scene (make-fixtures.py): it must not resemble any other fixture.
  for (const o of ["no_source", "inconclusive", "authentic", "miscontextualized", "provider_timeout", "edited", "trusted_edited", "trusted_context"]) {
    await add("different", "inputs/ai_generated", `inputs/${o}`, await f("public/fixtures/inputs/ai_generated.png"), await f(`public/fixtures/inputs/${o}.png`));
  }
  for (const s of scenes) await add("different", "inputs/ai_generated", s, await f("public/fixtures/inputs/ai_generated.png"), await scene(s));
  const tpl = ["no_source", "inconclusive", "authentic", "miscontextualized", "provider_timeout"];
  for (let i = 0; i < tpl.length; i++) for (let j = i + 1; j < tpl.length; j++) await add("template", tpl[i], tpl[j], await f(`public/fixtures/inputs/${tpl[i]}.png`), await f(`public/fixtures/inputs/${tpl[j]}.png`));

  // per-image embedding time, steady state
  gate["cache"].clear();
  const times: number[] = [];
  for (const s of scenes) { const t = performance.now(); await gate.embed(await scene(s), signal); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);

  const stat = (k: string) => rows.filter((r) => r.kind === k).map((r) => r.sim);
  const summary = {
    threshold: SCENE_MIN_SIMILARITY,
    loadMs: Math.round(loadMs), embedMedianMs: Math.round(times[Math.floor(times.length / 2)]),
    sameMin: Math.min(...stat("same")), differentMax: Math.max(...stat("different")),
    templateRange: [Math.min(...stat("template")), Math.max(...stat("template"))],
    lookalikeRange: [Math.min(...stat("lookalike")), Math.max(...stat("lookalike"))],
    differentPassingPixelGate: rows.filter((r) => r.kind !== "same" && r.kind !== "template" && r.matched).map((r) => `${r.a}~${r.b} sim=${r.sim} regions=${r.regions} changed=${r.changed}`),
  };
  for (const r of rows) console.log([r.kind, r.a, r.b, r.matched ? "pixel-match" : "-", r.regions, r.changed, r.sim].join("\t"));
  console.log(JSON.stringify(summary, null, 2));
  const out = process.argv.indexOf("--json");
  if (out > 0) await writeFile(process.argv[out + 1], JSON.stringify({ summary, rows }, null, 2));
}
main();
