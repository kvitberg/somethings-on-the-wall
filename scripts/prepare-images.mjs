// Crops the white Etsy margin off each original and writes a web master
// (2000 px long edge) to src/assets/prints/<slug>.jpg. Also extracts the
// handwritten signature from one file's margin as a transparent PNG.
// Usage: node scripts/prepare-images.mjs [originalsDir]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const originals = process.argv[2] ?? path.join(root, '_originals');
const outDir = path.join(root, 'src/assets/prints');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/data/prints.json'), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// The Etsy template places the photo at the same spot in every 3300x4200 file.
const TEMPLATE = { left: 488, top: 456, right: 2808, bottom: 3748 };
const INSET = 6; // stay clear of the anti-aliased edge

// Find the photo edge by scanning inward for the first mostly non-white line,
// and fall back to the template when the scan disagrees (bright skies).
async function photoBounds(file) {
  const { data: px, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const lineIsPhoto = (get, len) => {
    let dark = 0;
    for (let i = 0; i < len; i++) if (get(i) < 238) dark++;
    return dark > len * 0.3;
  };
  const col = (x) => lineIsPhoto((y) => px[y * W + x], H);
  const row = (y) => lineIsPhoto((x) => px[y * W + x], W);
  let l = 0; while (l < W / 2 && !col(l)) l++;
  let r = W - 1; while (r > W / 2 && !col(r)) r--;
  let t = 0; while (t < H / 2 && !row(t)) t++;
  let b = H - 1; while (b > H / 2 && !row(b)) b--;
  const found = { left: l, top: t, right: r, bottom: b };
  const off = Object.keys(TEMPLATE).some((k) => Math.abs(found[k] - TEMPLATE[k]) > 24);
  return { bounds: off ? TEMPLATE : found, usedTemplate: off };
}

for (const p of data.prints) {
  const src = path.join(originals, `${p.file}.jpg`);
  const { bounds, usedTemplate } = await photoBounds(src);
  const region = {
    left: bounds.left + INSET,
    top: bounds.top + INSET,
    width: bounds.right - bounds.left - 2 * INSET,
    height: bounds.bottom - bounds.top - 2 * INSET,
  };
  await sharp(src)
    .extract(region)
    .resize({ width: 2000, height: 2000, fit: 'inside' })
    .jpeg({ quality: 84, mozjpeg: true })
    .withMetadata({ exif: { IFD0: { Copyright: '© Scott Kvitberg', Artist: 'Scott Kvitberg', ImageDescription: `${p.title}. Photograph by Scott Kvitberg.` } } })
    .toFile(path.join(outDir, `${p.slug}.jpg`));
  console.log(p.slug.padEnd(22), usedTemplate ? 'template' : 'scanned ', region.width + 'x' + region.height);
}

// Signature: the ink below the photo's bottom-right corner, as ink-on-transparent.
const sigSrc = path.join(originals, 'door.jpg');
const sigRegion = { left: 2575, top: 3756, width: 300, height: 140 };
const grey = await sharp(sigSrc).extract(sigRegion).greyscale().normalise().raw().toBuffer();
const alpha = Buffer.from(grey.map((v) => Math.max(0, Math.min(255, (235 - v) * 2.2))));
await sharp({ create: { width: sigRegion.width, height: sigRegion.height, channels: 3, background: '#141414' } })
  .joinChannel(alpha, { raw: { width: sigRegion.width, height: sigRegion.height, channels: 1 } })
  .png()
  .toFile(path.join(root, 'public/signature.png'));
console.log('signature -> public/signature.png');
