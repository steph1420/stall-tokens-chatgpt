// F-13 Tokens restart per day; each Counter device draws from its own range (D-TOKEN).
import type { Order } from '../../contract';

export interface Range { readonly from: number; readonly to: number }

/** Next token in this device's range for the day; wraps to the start if the range is used up. */
export function nextToken(orders: readonly Order[], dayId: string, range: Range): number {
  let max = range.from - 1;
  for (const o of orders) if (o.dayId === dayId && o.token >= range.from && o.token <= range.to && o.token > max) max = o.token;
  return max + 1 > range.to ? range.from : max + 1;
}

export const formatToken = (t: number, pad: number): string => `#${String(t).padStart(pad, '0')}`;
