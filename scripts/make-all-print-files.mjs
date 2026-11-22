// Builds print files (11x14, 18x24, 24x36 in the template) for every print that came from a raw photo.
// Usage: node scripts/make-all-print-files.mjs [slug ...]
import fs from 'node:fs';
import path from 'node:path';
import { makePrintFiles } from './make-print-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/data/prints.json'), 'utf8'));
const only = process.argv.slice(2);
const out = path.join(root, 'print-files');
const todo = data.prints.filter((p) => p.raw && (!only.length || only.includes(p.slug)));
let i = 0;
for (const p of todo) {
  const src = path.join(root, '_originals', `${p.file}.jpg`);
  const { orientation, written } = await makePrintFiles(src, { out, name: p.slug, focus: p.printFocus ?? [50, 50] });
  console.log(`${++i}/${todo.length} ${p.slug} (${orientation})`);
  for (const line of written) console.log('   ' + line);
}
