// F-45 Shared amount lists (Steve 16 Nov 19:31 IST): tip choices and round-off steps live in `setting.set` (synced to
// every phone and the Sheet `settings` tab) as comma-separated paise; CONFIG holds the defaults until someone edits them.
import { CONFIG } from '../../config';
import type { Paise } from '../../contract';

export type AmountsKey = 'tipChips' | 'roundOffSteps';
const DEFAULTS: Readonly<Record<AmountsKey, readonly Paise[]>> = { tipChips: CONFIG.payment.tipChips, roundOffSteps: CONFIG.money.roundOffSteps };
/** Limits per list: how many values and the largest one (paise). */
export const AMOUNT_LIMITS: Readonly<Record<AmountsKey, { max: number; top: Paise }>> = { tipChips: { max: 4, top: 50000 }, roundOffSteps: { max: 3, top: 10000 } };

/** The list in use: the shared setting when valid, else the CONFIG default. */
export function amounts(settings: Readonly<Record<string, string>>, key: AmountsKey): readonly Paise[] {
  const raw = settings[key];
  if (raw === undefined) return DEFAULTS[key];
  const v = raw.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return v.length > 0 || raw === '' ? v : DEFAULTS[key];
}

/** Parses what the person typed (rupees, e.g. "10, 20 50") into a sorted, unique paise list, or an error line. */
export function parseRupees(text: string, key: AmountsKey): { ok: readonly Paise[] } | { error: string } {
  const parts = text.split(/[\s,·/]+/).map((x) => x.replace(/^₹/, '')).filter(Boolean);
  const lim = AMOUNT_LIMITS[key];
  const vals: Paise[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) return { error: `“${p}” is not an amount` };
    const paise = Math.round(n * 100);
    if (paise > lim.top) return { error: `Keep each one at ₹${String(lim.top / 100)} or less` };
    if (!vals.includes(paise)) vals.push(paise);
  }
  if (vals.length > lim.max) return { error: `Up to ${String(lim.max)} amounts` };
  return { ok: vals.sort((a, b) => a - b) };
}

export const rupeesText = (v: readonly Paise[]): string => v.map((x) => String(x / 100)).join(', ');
