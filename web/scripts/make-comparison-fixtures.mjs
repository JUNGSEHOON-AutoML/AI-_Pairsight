// Owned synthetic scenes; real pixel pairs for algorithm tests, not an accuracy benchmark.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const out = 'tests/fixtures/comparison';
await mkdir(out, { recursive: true });
const base = await readFile('public/fixtures/inputs/authentic.png');
await writeFile(out + '/original.png', base);
await sharp(base).extract({ left: 100, top: 75, width: 600, height: 450 }).png().toFile(out + '/cropped.png');
await sharp(base).flop().png().toFile(out + '/flipped.png');
await sharp(base).linear(.8, 18).png().toFile(out + '/color.png');
await sharp(base).resize(400).jpeg({ quality: 70 }).toFile(out + '/compressed.jpg');
await sharp(base).composite([{ input: Buffer.from('<svg width="100" height="120"><rect width="100" height="120" fill="#f01849"/></svg>'), left: 550, top: 250 }]).png().toFile(out + '/edited.png');
const unrelated = Buffer.from('<svg width="800" height="600"><rect width="800" height="600" fill="#141b4d"/><circle cx="400" cy="300" r="230" fill="#f0d832"/><path d="M0 0L800 600M800 0L0 600" stroke="#f51b76" stroke-width="50"/></svg>');
await sharp(unrelated).png().toFile(out + '/unrelated.png');
const context = await readFile('public/fixtures/inputs/miscontextualized.png');
await sharp(context).resize(760, 570).png().toFile('public/fixtures/inputs/fact_check_found.png');
// Verdict v3 fixtures (replica/trusted-sources.md): metadata-stripped SNS-style copies. JPEG round trip, no EXIF/C2PA.
// trusted_edited: an older page on a (fictional) trusted domain shows the scene; the upload has a local change.
const house = await readFile('public/fixtures/inputs/no_source.png');
await writeFile('public/fixtures/originals/trusted_edited.png', house);
const editedJpeg = await sharp(house)
  .composite([{ input: Buffer.from('<svg width="150" height="130"><rect width="150" height="130" rx="10" fill="#1f7a4d"/><text x="22" y="78" font-size="38" fill="#fff" font-family="sans-serif">SOLD</text></svg>'), left: 590, top: 420 }])
  .jpeg({ quality: 82 }).toBuffer();
await sharp(editedJpeg).png().toFile('public/fixtures/inputs/trusted_edited.png');
// trusted_context: the same picture, re-shared smaller; the trusted page dates it years before the claim.
const park = await readFile('public/fixtures/inputs/inconclusive.png');
await sharp(park).modulate({ hue: 25 }).png().toFile('public/fixtures/originals/trusted_context.png');
const reshared = await sharp(await readFile('public/fixtures/originals/trusted_context.png')).resize(640, 480).jpeg({ quality: 80 }).toBuffer();
await sharp(reshared).png().toFile('public/fixtures/inputs/trusted_context.png');
console.log('comparison pairs, fact-check and trusted-source fixtures generated');
