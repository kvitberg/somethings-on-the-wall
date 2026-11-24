// Counts paid orders per payment link and writes them to src/data/sales.json under the
// key's mode, so test purchases never change what the public site shows. Rebuild and deploy after.
//
// Usage: npm run stripe:sold [-- --live]
import { client, getMode, linksFile, printsFile, readJson, salesFile, writeJson } from './lib.mjs';

const { key, mode } = getMode();
const stripe = client(key);
const links = readJson(linksFile)[mode] ?? {};
const data = readJson(printsFile);
const sales = readJson(salesFile);
sales[mode] ??= {};

let changed = 0;
for (const p of data.prints) {
  const link = links[p.slug];
  if (!link) continue;
  let paid = 0;
  let after;
  do {
    const page = await stripe('GET', '/checkout/sessions', { payment_link: link.id, status: 'complete', limit: 100, starting_after: after });
    paid += page.data.filter((s) => s.payment_status === 'paid').length;
    after = page.has_more ? page.data.at(-1).id : undefined;
  } while (after);
  if ((sales[mode][p.slug] ?? 0) !== paid) {
    console.log(`${p.slug}: ${sales[mode][p.slug] ?? 0} -> ${paid} sold`);
    sales[mode][p.slug] = paid;
    changed++;
  }
}
writeJson(salesFile, sales);
console.log(`${mode} mode: ${changed} print(s) updated.`);
