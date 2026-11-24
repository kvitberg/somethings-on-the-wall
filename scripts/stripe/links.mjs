// Creates one Stripe product, price and payment link per print and size. All sizes of a print
// share one edition, so every link is capped at what is left of it; stripe:sold keeps the caps
// in step after each sale and closes all links when the edition is gone.
// Safe to run again: links whose price and edition are unchanged are kept; anything else is
// closed and replaced. Shipping is one fixed rate added at checkout.
//
// Usage: npm run stripe:links [-- --dry-run] [-- --live] [-- slug ...]
import { client, getMode, linksFile, printsFile, readJson, salesFile, writeJson } from './lib.mjs';

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
const sales = readJson(salesFile);
links[mode] ??= {};
const done = links[mode];
const save = () => !dryRun && writeJson(linksFile, links);

// One shipping rate for every link, recreated only when the amount changes.
const shippingCents = Math.round((data.defaults.shippingEur ?? 0) * 100);
let shippingRate = done._shipping;
if (shippingCents > 0 && shippingRate?.amount !== shippingCents) {
  const rate = await stripe('POST', '/shipping_rates', {
    display_name: 'Tracked shipping',
    type: 'fixed_amount',
    fixed_amount: { amount: shippingCents, currency: 'eur' },
  });
  shippingRate = done._shipping = { id: rate.id, amount: shippingCents };
  save();
}

const closeLink = async (id) => stripe('POST', `/payment_links/${id}`, { active: false });

let created = 0;
for (const raw of data.prints.filter((p) => !only.length || only.includes(p.slug))) {
  const p = { ...data.defaults, ...raw };
  const remaining = p.editionSize - (p.sold ?? 0) - (sales[mode]?.[p.slug] ?? 0);
  let record = done[p.slug];
  // Links from before sizes existed: close them and keep their ids so past sales still count.
  if (record?.id) {
    await closeLink(record.id);
    record = done[p.slug] = { retired: [record.id] };
    save();
  }
  record ??= done[p.slug] = { retired: [] };

  for (const size of p.sizes) {
    const amount = Math.round(size.priceEur * 100);
    const existing = record[size.id];
    const shippingId = shippingRate?.id ?? null;
    if (existing && existing.amount === amount && existing.editionSize === p.editionSize && existing.shipping === shippingId) continue;
    if (existing) {
      console.log(`${p.slug} ${size.id}: price, edition or shipping changed, closing the old link`);
      await closeLink(existing.id);
      record.retired.push(existing.id);
    }
    if (remaining <= 0) continue;

    const dims = `${size.inches[0]} × ${size.inches[1]} in (${size.cm[0]} × ${size.cm[1]} cm)`;
    const product = await stripe('POST', '/products', {
      name: `${p.title}, signed print, ${size.inches[0]} × ${size.inches[1]} in`,
      description: `${dims}, ${p.paper}. One of a numbered edition of ${p.editionSize} across all sizes, signed by Scott Kvitberg.`,
      images: [`${SITE}/og/${p.slug}.jpg`],
      metadata: { slug: p.slug, size: size.id },
    });
    const price = await stripe('POST', '/prices', { product: product.id, currency: 'eur', unit_amount: amount, metadata: { slug: p.slug, size: size.id } });
    const link = await stripe('POST', '/payment_links', {
      line_items: [{ price: price.id, quantity: 1 }],
      restrictions: { completed_sessions: { limit: remaining } },
      inactive_message: `${p.title} is sold out. All ${p.editionSize} prints in the edition have been collected.`,
      shipping_address_collection: { allowed_countries: COUNTRIES },
      shipping_options: shippingId ? [{ shipping_rate: shippingId }] : undefined,
      phone_number_collection: { enabled: true },
      custom_text: { submit: { message: 'Printed to order and shipped with a certificate carrying your edition number and the photographer’s signature.' } },
      after_completion: { type: 'redirect', redirect: { url: `${SITE}/thanks/?print=${p.slug}` } },
      metadata: { slug: p.slug, size: size.id },
    });
    record[size.id] = { id: link.id, url: link.url, product: product.id, price: price.id, amount, editionSize: p.editionSize, shipping: shippingId };
    created++;
    console.log(`${p.slug} ${size.id}: ${link.url}`);
    save(); // save as we go, so a failure halfway loses nothing
  }
}
const total = Object.entries(done).filter(([k]) => !k.startsWith('_')).reduce((n, [, r]) => n + Object.keys(r).filter((k) => k !== 'retired').length, 0);
console.log(`${mode} mode: ${created} new link(s), ${total} active.${dryRun ? ' (dry run, nothing saved)' : ''}`);
