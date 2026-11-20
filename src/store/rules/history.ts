// F-64 History rows (W-08 every sent order, W-18 padded tokens, W-21 refund state of a cancel, W-10 refund when money is held). Pure.
import type { Order, Refund } from '../../contract';
import { formatInr } from '../../contract';
import { due, held, refunded } from './bill';
import { unpaid, writtenOff } from './status';

export type Tone = 'ok' | 'warn' | 'danger' | 'info';
export interface HistoryTag { readonly text: string; readonly tone: Tone }

const sumBy = (o: Order, k: 'cash' | 'upi') => o.payments.reduce((t, p) => t + p[k], 0);
/** How the bill was paid, in the words the Counter uses. '' when nothing was paid. */
export function howPaid(o: Order): 'Cash' | 'UPI' | 'Mixed' | '' {
  const cash = sumBy(o, 'cash'); const upi = sumBy(o, 'upi');
  return cash && upi ? 'Mixed' : upi ? 'UPI' : cash ? 'Cash' : '';
}
const refundWay = (rs: readonly Refund[]): string => {
  const live = rs.filter((r) => r.voided === null);
  if (live.length && live.every((r) => r.source === 'cash')) return ' cash';
  if (live.length && live.every((r) => r.source === 'upi')) return ' UPI';
  return '';
};

/** One tag per row, most urgent first: a cancel's refund state, written off, unpaid, refund owed, refunded, paid. */
export function historyTag(o: Order): HistoryTag {
  const back = refunded(o);
  if (o.cancel) {
    const hold = held(o);
    if (hold > 0) return { text: `Cancelled · Refund due ${formatInr(hold)}`, tone: 'danger' };
    return { text: back > 0 ? `Cancelled · Refunded ${formatInr(back)}${refundWay(o.refunds)}` : 'Cancelled', tone: 'danger' };
  }
  const owed = due(o);
  if (writtenOff(o)) return { text: `Written off ${formatInr(owed)}`, tone: 'warn' };
  if (unpaid(o)) return { text: `Unpaid ${formatInr(owed)}`, tone: 'warn' };
  if (owed < 0) return { text: `Refund due ${formatInr(-owed)}`, tone: 'warn' };
  if (back > 0) return { text: `Refunded ${formatInr(back)}${refundWay(o.refunds)}`, tone: 'info' };
  const how = howPaid(o);
  return { text: how ? `Paid ${how === 'Mixed' ? 'cash + UPI' : how === 'Cash' ? 'cash' : 'UPI'}` : 'Paid', tone: 'ok' };
}

/** W-08: every order that left the Counter (sent, paid or cancelled) on a day; drafts stay out. */
export const historyOrders = (orders: readonly Order[], dayId: string): Order[] =>
  orders.filter((o) => !o.deleted && o.dayId === dayId && (o.sent || o.payments.length > 0 || o.cancel !== null));

/** When the row happened: first payment, else when the order was made. */
export const rowAt = (o: Order): number => o.payments[0]?.at ?? o.createdAt;

/** F-64 search (FEATURES §17): a token number ("4", "#004"), a client name or an item, case-insensitive. */
export function matchOrder(o: Order, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const num = /^#?0*(\d+)$/.exec(q);
  if (num) return o.token === Number(num[1]);
  return o.client.toLowerCase().includes(q) || o.note.toLowerCase().includes(q) || o.lines.some((l) => l.qty > 0 && l.name.toLowerCase().includes(q));
}
