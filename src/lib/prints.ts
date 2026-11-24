import type { ImageMetadata } from 'astro';
import data from '../data/prints.json';
import stripeLinks from '../data/stripe-links.json';
import salesByMode from '../data/sales.json';
import sellerData from '../data/seller.json';

const images = import.meta.glob<{ default: ImageMetadata }>('../assets/prints/*.jpg', { eager: true });

export type Room = (typeof data.rooms)[number];

export const rooms: Room[] = data.rooms;

// Checkout links come from scripts/stripe/links.mjs, one per print and size. The public build
// uses live links only; `npm run dev:test-checkout` shows test links locally.
export const checkoutMode = process.env.STRIPE_MODE === 'test' ? 'test' : 'live';
type LinkRecord = { url: string };
const checkout = ((stripeLinks as Record<string, unknown>)[checkoutMode] ?? {}) as Record<string, Record<string, LinkRecord>>;
const sales: Record<string, number> = (salesByMode as Record<string, Record<string, number>>)[checkoutMode] ?? {};

export const seller = sellerData;
export const sellerComplete = Boolean(seller.name && seller.orgNumber && seller.address && seller.email);
// Never take real money without the seller details the law requires on the site.
if (checkoutMode === 'live' && Object.keys(checkout).some((k) => !k.startsWith('_')) && !sellerComplete) {
  throw new Error('Live checkout links exist but src/data/seller.json is incomplete. Add org number, address and email first.');
}

type SizeDef = { id: string; inches: number[]; cm: number[]; priceEur: number };

export const prints = data.prints.map((p, i) => {
  const base = { ...data.defaults, ...p };
  // prints.json holds any prints sold outside Stripe; sales.json adds paid Stripe orders.
  const merged = { ...base, sold: base.sold + (sales[p.slug] ?? 0) };
  const image = images[`../assets/prints/${p.slug}.jpg`]?.default;
  if (!image) throw new Error(`Missing web image for ${p.slug}; run scripts/prepare-images.mjs`);
  const room = rooms.find((r) => r.id === p.room);
  if (!room) throw new Error(`Unknown room ${p.room} on ${p.slug}`);
  const remaining = merged.editionSize - merged.sold;
  const landscape = image.width > image.height;
  // Sizes are listed portrait-first in the data; landscape photos swap width and height.
  const sizes = (merged.sizes as SizeDef[]).map((z) => {
    const [w, h] = landscape ? [z.inches[1], z.inches[0]] : [z.inches[0], z.inches[1]];
    const [cw, ch] = landscape ? [z.cm[1], z.cm[0]] : [z.cm[0], z.cm[1]];
    return { id: z.id, priceEur: z.priceEur, label: `${w} × ${h} in`, cm: `${cw} × ${ch} cm`, url: checkout[p.slug]?.[z.id]?.url ?? '' };
  });
  const fromPrice = Math.min(...sizes.map((z) => z.priceEur));
  return {
    ...merged,
    number: i + 1,
    numberLabel: String(i + 1).padStart(2, '0'),
    image,
    room,
    remaining,
    nextNumber: merged.sold + 1,
    soldOut: remaining <= 0,
    landscape,
    sizes,
    fromPrice,
    hasCheckout: remaining > 0 && sizes.some((z) => z.url),
  };
});

export type Print = (typeof prints)[number];

export const featured = prints.find((p) => p.slug === data.featured) ?? prints[0];

type Detail = { x: number; y: number; zoom: number };
export const detailOf = (p: Print): Detail => ('detail' in p && p.detail ? (p.detail as Detail) : { x: 50, y: 50, zoom: 1.6 });

// The preview notice and noindex stay until live checkout links exist.
export const isPreview = !(checkoutMode === 'live' && Object.keys(checkout).some((k) => !k.startsWith('_')));

const eurFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur = (n: number) => eurFormat.format(n);

export const pad = (n: number) => String(n).padStart(2, '0');

export const SITE_URL = 'https://kvitberg.github.io/somethings-on-the-wall';
export const href = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;

export const printsInRoom = (roomId: string) => prints.filter((p) => p.room.id === roomId);

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const inWords = (n: number) => numberWords[n] ?? String(n);

/** How a room's grid is laid out so every row fills: one or two large tiles, three or four columns. */
export const roomLayout = (n: number) => {
  const twoBig = n % 4 === 2 && n >= 6;
  const cols = n % 4 === 1 || twoBig ? 4 : 3;
  const bigs = twoBig ? [0, 5] : [0];
  const oddTail = (n - bigs.length) % 2 === 1;
  return { cols, bigs, oddTail };
};
