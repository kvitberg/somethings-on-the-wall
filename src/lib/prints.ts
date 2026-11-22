import type { ImageMetadata } from 'astro';
import data from '../data/prints.json';

const images = import.meta.glob<{ default: ImageMetadata }>('../assets/prints/*.jpg', { eager: true });

export type Room = (typeof data.rooms)[number];

export const rooms: Room[] = data.rooms;

export const prints = data.prints.map((p, i) => {
  const merged = { ...data.defaults, ...p };
  const image = images[`../assets/prints/${p.slug}.jpg`]?.default;
  if (!image) throw new Error(`Missing web image for ${p.slug}; run scripts/prepare-images.mjs`);
  const room = rooms.find((r) => r.id === p.room);
  if (!room) throw new Error(`Unknown room ${p.room} on ${p.slug}`);
  const remaining = merged.editionSize - merged.sold;
  return {
    ...merged,
    number: i + 1,
    numberLabel: String(i + 1).padStart(2, '0'),
    image,
    room,
    remaining,
    nextNumber: merged.sold + 1,
    soldOut: remaining <= 0,
  };
});

export type Print = (typeof prints)[number];

export const featured = prints.find((p) => p.slug === data.featured) ?? prints[0];

type Detail = { x: number; y: number; zoom: number };
export const detailOf = (p: Print): Detail => ('detail' in p && p.detail ? (p.detail as Detail) : { x: 50, y: 50, zoom: 1.6 });

export const isPreview = true; // remove the preview notice once prices and editions are confirmed

const eurFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur = (n: number) => eurFormat.format(n);

export const pad = (n: number) => String(n).padStart(2, '0');

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
