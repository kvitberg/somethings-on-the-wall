// Creates one Stripe product, price and payment link per print, capped at the edition size.
// Safe to run again: prints that already have a link with the same price are skipped;
// a changed price deactivates the old link and makes a new one.
//
// Usage: npm run stripe:links [-- --dry-run] [-- --live] [-- slug ...]
import { client, getMode, linksFile, printsFile, readJson, writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));
const { key, mode } = getMode({ dryRun });
const stripe = client(key, { dryRun });

const SITE = (process.env.SITE_URL ?? 'https://kvitberg.github.io/somethings-on-the-wall').replace(/\/$/, '');
// Where the lab ships to. Stripe needs an explicit list.
const COUNTRIES = ['NO', 'SE', 'DK', 'FI', 'IS', 'GB', 'IE', 'DE', 'AT', 'CH', 'NL', 'BE', 'LU', 'FR', 'ES', 'PT', 'IT', 'MT', 'GR', 'CY', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'RO', 'BG', 'EE', 'LV', 'LT', 'US', 'CA', 'AU', 'NZ', 'JP', 'SG', 'HK', 'KR', 'AE', 'IL'];

const data = readJson(printsFile);
const links = readJson(linksFile);
links[mode] ??= {};
const done = links[mode];

const todo = data.prints.filter((p) => !only.length || only.includes(p.slug));
let created = 0;
for (const raw of todo) {
  const p = { ...data.defaults, ...raw };
  const amount = Math.round(p.priceEur * 100);
  const existing = done[p.slug];
  if (existing && existing.amount === amount && existing.editionSize === p.editionSize) continue;
  if (existing) {
    console.log(`${p.slug}: price or edition changed, closing the old link`);
    await stripe('POST', `/payment_links/${existing.id}`, { active: false });
  }

  const product = existing?.product
    ? { id: existing.product }
    : await stripe('POST', '/products', {
        name: `${p.title}, signed print`,
        description: `${p.format}, ${p.paper}. One of a numbered edition of ${p.editionSize}, signed by Scott Kvitberg.`,
        images: [`${SITE}/og/${p.slug}.jpg`],
        metadata: { slug: p.slug },
      });
  const price = await stripe('POST', '/prices', { product: product.id, currency: 'eur', unit_amount: amount, metadata: { slug: p.slug } });
  const shipping = (p.shippingEur ?? 0) > 0
    ? [{ shipping_rate_data: { display_name: 'Tracked shipping', type: 'fixed_amount', fixed_amount: { amount: Math.round(p.shippingEur * 100), currency: 'eur' } } }]
    : undefined;
  const link = await stripe('POST', '/payment_links', {
    line_items: [{ price: price.id, quantity: 1 }],
    restrictions: { completed_sessions: { limit: p.editionSize - (p.sold ?? 0) } },
    inactive_message: `${p.title} is sold out. All ${p.editionSize} prints in the edition have been collected.`,
    shipping_address_collection: { allowed_countries: COUNTRIES },
    shipping_options: shipping,
    phone_number_collection: { enabled: true },
    custom_text: { submit: { message: 'Printed to order and shipped with a certificate carrying your edition number and the photographer’s signature.' } },
    after_completion: { type: 'redirect', redirect: { url: `${SITE}/thanks/?print=${p.slug}` } },
    metadata: { slug: p.slug },
  });
  done[p.slug] = { id: link.id, url: link.url, product: product.id, price: price.id, amount, editionSize: p.editionSize };
  created++;
  console.log(`${p.slug}: ${link.url}`);
  if (!dryRun) writeJson(linksFile, links); // save as we go, so a failure halfway loses nothing
}
console.log(`${mode} mode: ${created} new link(s), ${Object.keys(done).length} total.${dryRun ? ' (dry run, nothing saved)' : ''}`);
