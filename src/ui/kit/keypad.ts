// One owner for typing whole rupees on a keypad (payment numpad, money entry). The first key replaces the shown amount.
import { CONFIG } from '../../config';

export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;
export type Key = (typeof KEYS)[number];
const MAX_RUPEES = CONFIG.limits.moneyMaxPaise / CONFIG.money.paisePerRupee;

/** Next amount in rupees after a key, or null when it would pass the money limit. */
export function nextAmount(rupees: number, k: Key, fresh: boolean): number | null {
  const cur = fresh && k !== 'del' ? '0' : String(rupees);
  const next = k === 'del' ? cur.slice(0, -1) : cur === '0' ? k.replace(/^0+/, '') : cur + k;
  const n = Number(next || '0');
  return n <= MAX_RUPEES ? n : null;
}
