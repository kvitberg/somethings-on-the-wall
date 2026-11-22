// Places finished photographs into the print template (the InDesign "FS Web Shop" layout):
// a white border, the photo in its window, and Scott's signature in the bottom margin,
// at 11x14, 18x24 and 24x36 inches, 300 dpi. Portrait or landscape is detected per photo.
//
// Usage: node scripts/make-print-files.mjs [--out print-files] [--focus 50,40] photo.jpg [more.jpg ...]
//   --focus x,y  where to keep the subject when the photo is cropped to the window (percent, default centre)
//
// Measurements come from Scott's existing Etsy files, which were made with this template.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const SIGNATURE = path.join(root, 'scripts/assets/signature-master.png');

// [canvas w, h], photo window [left, top, right, bottom], signature box [left, top, right, bottom], in pixels at 300 dpi.
export const TEMPLATES = {
  portrait: {
    '11x14': { size: [3300, 4200], window: [489, 456, 2808, 3750], sig: [2592, 3759, 2841, 3843] },
    '18x24': { size: [5400, 7200], window: [530, 550, 4850, 6372], sig: [4153, 6735, 4835, 6971] },
    '24x36': { size: [7200, 10800], window: [812, 831, 6382, 9556], sig: [5825, 9713, 6316, 9871] },
  },
  landscape: {
    '14x11': { size: [4200, 3300], window: [454, 431, 3749, 2864], sig: [3497, 2932, 3715, 3035] },
    '24x18': { size: [7200, 5400], window: [530, 550, 6650, 4850], sig: [6218, 4948, 6585, 5125] },
    '36x24': { size: [10800, 7200], window: [785, 1267, 9936, 6352], sig: [9367, 6539, 9857, 6765] },
  },
};

function parseArgs(argv) {
  const opts = { out: path.join(root, 'print-files'), focus: [50, 50], files: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = path.resolve(argv[++i]);
    else if (argv[i] === '--focus') opts.focus = argv[++i].split(',').map(Number);
    else opts.files.push(path.resolve(argv[i]));
  }
  return opts;
}

export async function makePrintFiles(file, { out, focus = [50, 50], name: givenName }) {
  const meta = await sharp(file).rotate().metadata();
  const w = meta.autoOrient?.width ?? meta.width;
  const h = meta.autoOrient?.height ?? meta.height;
  const orientation = w >= h ? 'landscape' : 'portrait';
  const name = givenName ?? path.basename(file, path.extname(file));
  const dir = path.join(out, name);
  fs.mkdirSync(dir, { recursive: true });
  const written = [];

  for (const [label, t] of Object.entries(TEMPLATES[orientation])) {
    const [cw, ch] = t.size;
    const [wl, wt, wr, wb] = t.window;
    const ww = wr - wl;
    const wh = wb - wt;

    // Crop the photo to the window's shape around the focus point, then scale it to fill the window.
    const scale = Math.max(ww / w, wh / h);
    const sw = Math.round(ww / scale);
    const sh = Math.round(wh / scale);
    const left = Math.min(w - sw, Math.max(0, Math.round((w * focus[0]) / 100 - sw / 2)));
    const top = Math.min(h - sh, Math.max(0, Math.round((h * focus[1]) / 100 - sh / 2)));
    const photo = await sharp(file).rotate().extract({ left, top, width: sw, height: sh }).resize(ww, wh, { kernel: 'lanczos3' }).toBuffer();

    const [sl, st, sr] = t.sig;
    const signature = await sharp(SIGNATURE).resize({ width: sr - sl }).toBuffer();

    const target = path.join(dir, `${name}-${label}.jpg`);
    await sharp({ create: { width: cw, height: ch, channels: 3, background: '#ffffff' } })
      .composite([
        { input: photo, left: wl, top: wt },
        { input: signature, left: sl, top: st },
      ])
      .withMetadata({ density: 300, exif: { IFD0: { Artist: 'Scott Kvitberg', Copyright: '© Scott Kvitberg' } } })
      .toColorspace('srgb')
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(target);
    const upscale = scale > 1 ? ` (photo enlarged ${scale.toFixed(2)}x)` : '';
    written.push(`${path.relative(root, target)}  ${cw}x${ch}${upscale}`);
  }
  return { orientation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.files.length) {
    console.error('Usage: node scripts/make-print-files.mjs [--out dir] [--focus x,y] photo.jpg ...');
    process.exit(1);
  }
  for (const f of opts.files) {
    const { orientation, written } = await makePrintFiles(f, opts);
    console.log(`${path.basename(f)} (${orientation})`);
    for (const line of written) console.log('  ' + line);
  }
}
