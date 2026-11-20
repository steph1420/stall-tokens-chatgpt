// F-23..F-25 Money rules (pure). Q-MIXED-1: parts must cover the amount exactly; only person parts touch balances.
// D-MONEY: tips are their own pot; donations and round-off count in profit. Refunds due come from cancelled orders (Q-CANCEL-1 A).
import type { Entry, MoneyPart, Order, Paise } from '../../contract';
import { due, held, tips, waived } from './bill';
import { unpaid, writtenOff } from './status';

export const partsSum = (parts: readonly MoneyPart[]): Paise => parts.reduce((t, p) => t + p.amount, 0);
/** Bar state on the Mixed sheet: "₹X of ₹total", green when covered. */
export function coverage(parts: readonly MoneyPart[], amount: Paise): { got: Paise; left: Paise; ok: boolean } {
  const got = partsSum(parts);
  return { got, left: amount - got, ok: amount > 0 && got === amount && parts.every((p) => p.amount > 0) };
}

export function checkEntry(amount: Paise, parts: readonly MoneyPart[]): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Type an amount';
  if (parts.length === 0) return 'Pick who paid';
  if (parts.some((p) => p.source === 'person' && !p.personId)) return 'Pick a name';
  return coverage(parts, amount).ok ? null : 'The parts must add up to the amount';
}

export interface RefundDue { readonly order: Order; readonly due: Paise }
/** Cancelled orders that still hold the customer's money (held includes tips, FIN-01). */
export const refundsDue = (orders: readonly Order[]): RefundDue[] =>
  orders.filter((o) => o.cancel && !o.deleted).map((o) => ({ order: o, due: held(o) })).filter((r) => r.due > 0);

export interface DayMoney {
  readonly cashSales: Paise; readonly upiSales: Paise; readonly tips: Paise; readonly waived: Paise; readonly refunds: { cash: Paise; upi: Paise };
  readonly spent: Paise; readonly received: Paise; readonly donations: Paise;
  /** Register money by the book (opening float added by the caller). */
  readonly registerFlow: Paise; readonly upiFlow: Paise;
  /** F-65 (W-08): money still to collect on every day's unpaid orders (the Unpaid tab), and this day's write-offs (Q-WRITEOFF-SPLIT A). */
  readonly unpaid: { amount: Paise; n: number }; readonly writtenOff: { amount: Paise; n: number };
}
const owedOf = (os: readonly Order[]) => ({ amount: os.reduce((t, o) => t + due(o), 0), n: os.length });
const sumBy = (es: readonly Entry[], src: MoneyPart['source']) => es.reduce((t, e) => t + e.parts.filter((p) => p.source === src).reduce((u, p) => u + p.amount, 0), 0);

export function dayMoney(orders: readonly Order[], entries: readonly Entry[], dayId: string): DayMoney {
  const os = orders.filter((o) => o.dayId === dayId && !o.deleted);
  const pays = os.flatMap((o) => o.payments);
  const refs = os.flatMap((o) => o.refunds).filter((r) => r.voided === null); // Undo (refund.void) gives nothing back
  const cashSales = pays.reduce((t, p) => t + p.cash, 0);
  const upiSales = pays.reduce((t, p) => t + p.upi, 0);
  const refunds = { cash: refs.filter((r) => r.source === 'cash').reduce((t, r) => t + r.amount, 0), upi: refs.filter((r) => r.source === 'upi').reduce((t, r) => t + r.amount, 0) };
  const es = entries.filter((e) => e.dayId === dayId && e.voided === null);
  const sp = es.filter((e) => e.dir === 'spent');
  const rc = es.filter((e) => e.dir === 'received');
  return {
    cashSales, upiSales, tips: os.reduce((t, o) => t + tips(o), 0), waived: os.reduce((t, o) => t + waived(o), 0), refunds,
    spent: sp.reduce((t, e) => t + e.amount, 0), received: rc.reduce((t, e) => t + e.amount, 0),
    donations: rc.filter((e) => e.kind === 'donation').reduce((t, e) => t + e.amount, 0),
    registerFlow: cashSales - refunds.cash + sumBy(rc, 'register') - sumBy(sp, 'register'),
    upiFlow: upiSales - refunds.upi + sumBy(rc, 'upi') - sumBy(sp, 'upi'),
    unpaid: owedOf(orders.filter(unpaid)), writtenOff: owedOf(os.filter(writtenOff)),
  };
}
