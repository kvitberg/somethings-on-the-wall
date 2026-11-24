// Counts paid orders across every size of each print and writes the total to
// src/data/sales.json under the key's mode, so test purchases never change what the public
// site shows. Then keeps the shared edition honest: each size's link is capped at its own
// completed sales plus what is left of the edition, and all links close when it is gone.
// Rebuild and deploy after.
//
// Usage: npm run stripe:sold [-- --live]
import { client, getMode, linksFile, printsFile, readJson, salesFile, writeJson } from './lib.mjs';

const { key, mode } = getMode();
const stripe = client(key);
const links = readJson(linksFile)[mode] ?? {};
const data = readJson(printsFile);
const sales = readJson(salesFile);
sales[mode] ??= {};

async function sessions(linkId) {
  let paid = 0;
  let completed = 0;
  let after;
  do {
    const page = await stripe('GET', '/checkout/sessions', { payment_link: linkId, status: 'complete', limit: 100, starting_after: after });
    completed += page.data.length;
    paid += page.data.filter((s) => s.payment_status === 'paid').length;
    after = page.has_more ? page.data.at(-1).id : undefined;
  } while (after);
  return { paid, completed };
}

let changed = 0;
for (const raw of data.prints) {
  const p = { ...data.defaults, ...raw };
  const record = links[p.slug];
  if (!record) continue;
  const active = Object.entries(record).filter(([k]) => k !== 'retired');
  let paid = 0;
  const perLink = [];
  for (const id of record.retired ?? []) paid += (await sessions(id)).paid;
  for (const [size, link] of active) {
    const s = await sessions(link.id);
    paid += s.paid;
    perLink.push({ size, link, completed: s.completed });
  }
  if ((sales[mode][p.slug] ?? 0) !== paid) {
    console.log(`${p.slug}: ${sales[mode][p.slug] ?? 0} -> ${paid} sold`);
    sales[mode][p.slug] = paid;
    changed++;
  }
  const remaining = p.editionSize - (p.sold ?? 0) - paid;
  for (const { size, link, completed } of perLink) {
    if (remaining <= 0) {
      await stripe('POST', `/payment_links/${link.id}`, { active: false });
      console.log(`${p.slug} ${size}: edition sold out, link closed`);
    } else if (paid > 0) {
      await stripe('POST', `/payment_links/${link.id}`, { restrictions: { completed_sessions: { limit: completed + remaining } } });
    }
  }
}
writeJson(salesFile, sales);
console.log(`${mode} mode: ${changed} print(s) updated.`);
