// F-30 / F-31 Stock rules (pure). Paste format per Q-STOCK-SET (stock-paste-v5) + t85u: "Name - qty - price paid - discount".
// Name = text before the first number. A number with a unit is the qty (unit kept); "off" or a bare 4th number is a rupee
// discount, "%" a percent discount; "rs" / "₹" marks the price paid; unlabelled numbers fill qty, price, discount in order;
// labels work in any order. Lines that do not give a name and a qty are flagged (amber), never added.
// W-23 (F-68): a line with no price is a count-only restock; it may only top up an item that already exists (no Spent entry).
import type { Item, Paise } from '../../contract';

export interface PasteLine {
  readonly raw: string; readonly name: string; readonly qty: number; readonly unit: string;
  readonly paid: Paise; readonly discount: { kind: 'amount' | 'pct'; value: number } | null; readonly ok: boolean;
  /** false = no price given (count-only restock, W-23). */
  readonly priced: boolean;
}
const NUM = /(₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(%|off\b|rs\b\.?|₹|[a-z]+)?/gi;
const toNum = (s: string) => Number(s.replace(/,/g, ''));

export function parseLine(raw: string): PasteLine {
  const text = raw.trim();
  const first = text.search(/\d|₹/);
  const name = (first < 0 ? text : text.slice(0, first)).replace(/\brs\.?\s*$/i, '').replace(/[\s\-–—:,]+$/, '').trim();
  const slot: { qty?: number; unit?: string; paid?: number; disc?: { kind: 'amount' | 'pct'; value: number } } = {};
  let extra = false;
  const bare: number[] = [];
  for (const m of (first < 0 ? '' : text.slice(first)).matchAll(NUM)) {
    const v = toNum(m[2] ?? '');
    const pre = (m[1] ?? '').toLowerCase();
    const suf = (m[3] ?? '').toLowerCase().replace(/\.$/, '');
    if (pre || suf === 'rs' || suf === '₹') { if (slot.paid === undefined) slot.paid = v; else extra = true; }
    else if (suf === '%') { if (slot.disc) extra = true; else slot.disc = { kind: 'pct', value: v }; }
    else if (suf === 'off') { if (slot.disc) extra = true; else slot.disc = { kind: 'amount', value: v }; }
    else if (suf) { if (slot.qty === undefined) { slot.qty = v; slot.unit = suf; } else extra = true; }
    else bare.push(v);
  }
  for (const v of bare) {
    if (slot.qty === undefined) slot.qty = v;
    else if (slot.paid === undefined) slot.paid = v;
    else if (!slot.disc) slot.disc = { kind: 'amount', value: v };
    else extra = true;
  }
  const qty = slot.qty ?? 0;
  const priced = slot.paid !== undefined;
  const ok = !!name && !extra && Number.isInteger(qty) && qty > 0 && (slot.paid ?? 0) >= 0 && (priced || !slot.disc);
  return { raw: text, name, qty, unit: slot.unit ?? '', paid: Math.round((slot.paid ?? 0) * 100), discount: slot.disc ?? null, ok, priced };
}

export const parsePaste = (text: string): PasteLine[] => text.split(/\r?\n/).filter((l) => l.trim()).map(parseLine);

/** Existing item for a pasted name (case-insensitive, removed items ignored). */
export const matchItem = (items: readonly Item[], name: string): Item | undefined =>
  items.find((i) => !i.removed && i.name.toLowerCase() === name.trim().toLowerCase());

/** W-23: a line that can be added: clear, and either priced or topping up a known item. */
export const usable = (l: PasteLine, items: readonly Item[]): boolean => l.ok && (l.priced || !!matchItem(items, l.name));
export const pasteTotal = (ls: readonly PasteLine[], items: readonly Item[]): Paise => ls.filter((l) => usable(l, items)).reduce((t, l) => t + l.paid, 0);

export type StockLevel = 'none' | 'ok' | 'low' | 'out';
export function level(i: Item): StockLevel {
  if (i.soldOut || i.count === 0) return 'out';
  if (i.count === null) return 'none';
  return i.count <= i.lowAt ? 'low' : 'ok';
}
