// Small Stripe REST helper (no SDK). Keys live in .env, which Scott fills in himself (gitignored).
import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '../..');
export const linksFile = path.join(root, 'src/data/stripe-links.json');
export const printsFile = path.join(root, 'src/data/prints.json');
export const salesFile = path.join(root, 'src/data/sales.json');
const API = 'https://api.stripe.com/v1';
const VERSION = '2026-11-18.endive';

// Test commands read STRIPE_SECRET_KEY; --live reads STRIPE_LIVE_SECRET_KEY, so both keys can
// sit in .env side by side and real payments only happen when asked for.
export function getMode({ dryRun = false } = {}) {
  const live = process.argv.includes('--live');
  const name = live ? 'STRIPE_LIVE_SECRET_KEY' : 'STRIPE_SECRET_KEY';
  const key = process.env[name] ?? '';
  if (dryRun && !key) return { key: '', mode: live ? 'live' : 'test' };
  const pattern = live ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
  if (!pattern.test(key)) {
    console.error(`Missing or wrong ${name}. Put a line like ${name}=${live ? 'rk_live_' : 'rk_test_'}... in .env (see STRIPE.md).`);
    process.exit(1);
  }
  return { key, mode: live ? 'live' : 'test' };
}

// Stripe expects form encoding with bracketed keys: a[b][0][c]=x
export function encode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    else if (typeof v === 'object') encode(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

export function client(key, { dryRun = false } = {}) {
  let n = 0;
  return async function stripe(method, pathname, params = {}) {
    const body = encode(params);
    if (dryRun && method !== 'GET') {
      console.log(`  [dry run] ${method} ${pathname} ${decodeURIComponent(body.toString()).slice(0, 220)}`);
      return { id: `dry_${pathname.split('/')[1]}_${++n}`, url: `https://buy.stripe.com/test_dry_${n}` };
    }
    const url = method === 'GET' ? `${API}${pathname}?${body}` : `${API}${pathname}`;
    // Retry network drops, rate limits and server errors. POSTs carry one idempotency key across
    // retries, so a retry after a lost response returns the same object instead of a duplicate.
    const idem = method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() };
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': VERSION, ...idem, ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
          body: method === 'GET' ? undefined : body,
        });
        if ((res.status === 429 || res.status >= 500) && attempt < 5) throw new Error(`HTTP ${res.status}`);
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`Stripe ${method} ${pathname}: ${json.error?.message ?? res.status}`);
    return json;
  };
}

export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
