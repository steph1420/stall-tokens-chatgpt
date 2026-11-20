// F-66 Close the day (FEATURES §21): checklist state, day summary and the cash check. Pure; money in paise.
import type { Day, DayLock, Entry, InfoRecord, Order, Paise } from '../../contract';
import { formatInr } from '../../contract';
import { CONFIG } from '../../config';
import { dayMoney, refundsDue } from './money';
import { unpaidOrders } from './status';

export type StepId = 'unpaid' | 'refunds' | 'cash' | 'notes' | 'lock';
export type StepState = 'done' | 'todo' | 'skipped';
/** Steps that can be left for later with one tap (D-P4-SKIP: no reason asked, the summary says it was skipped). */
export const SKIPPABLE = ['unpaid', 'refunds', 'cash'] as const;
export type Skippable = (typeof SKIPPABLE)[number];

/** The day's close record lives on the day note (record.set day_note, id = dayId): counted < 0 = not counted yet. */
export interface CloseRecord { readonly counted: Paise | null; readonly skipped: readonly Skippable[]; readonly text: string; readonly tags: readonly string[] }
export function closeRecord(rec: InfoRecord | undefined): CloseRecord {
  const f = rec?.fields ?? {};
  const c = typeof f.counted === 'number' && f.counted >= 0 ? f.counted : null;
  const tags = typeof f.tags === 'string' ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  return { counted: c, skipped: SKIPPABLE.filter((k) => f[`skip_${k}`] === true), text: typeof f.text === 'string' ? f.text : '', tags };
}

export interface TopItem { readonly name: string; readonly qty: number; readonly amount: Paise }
export interface DaySummary {
  readonly orders: number; readonly cancelled: number;
  readonly cash: Paise; readonly upi: Paise; readonly takings: Paise; readonly tips: Paise; readonly waived: Paise;
  readonly refunds: Paise; readonly writtenOff: { amount: Paise; n: number }; readonly unpaid: { amount: Paise; n: number };
  readonly spent: Paise; readonly received: Paise; readonly book: Paise; readonly top: readonly TopItem[];
}

function topItems(os: readonly Order[]): TopItem[] {
  const m = new Map<string, TopItem>();
  for (const o of os) for (const l of o.lines) {
    if (l.qty <= 0) continue;
    const p = m.get(l.name) ?? { name: l.name, qty: 0, amount: 0 };
    m.set(l.name, { name: l.name, qty: p.qty + l.qty, amount: p.amount + l.qty * l.price });
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, CONFIG.close.topItems);
}

/** Day summary: takings by way of payment (refunds taken off), tips, waived, write-offs, unpaid (all days, as the Unpaid tab). */
export function daySummary(orders: readonly Order[], entries: readonly Entry[], dayId: string, float: Paise): DaySummary {
  const d = dayMoney(orders, entries, dayId);
  const mine = orders.filter((o) => o.dayId === dayId && !o.deleted && (o.sent || o.payments.length > 0 || o.cancel));
  const kept = mine.filter((o) => !o.cancel);
  const cash = d.cashSales - d.refunds.cash; const upi = d.upiSales - d.refunds.upi;
  return {
    orders: kept.length, cancelled: mine.length - kept.length, cash, upi, takings: cash + upi, tips: d.tips, waived: d.waived,
    refunds: d.refunds.cash + d.refunds.upi, writtenOff: d.writtenOff, unpaid: d.unpaid,
    spent: d.spent, received: d.received, book: float + d.registerFlow, top: topItems(kept),
  };
}

/** Cash in the box vs the book ("₹20 short" is the most common stall dispute). */
export function cashCheck(counted: Paise | null, book: Paise): { diff: Paise; text: string; tone: 'ok' | 'warn' | 'none' } {
  if (counted === null) return { diff: 0, text: 'Not counted yet', tone: 'none' };
  const diff = counted - book;
  if (diff === 0) return { diff, text: 'Matches the book', tone: 'ok' };
  return { diff, text: `${formatInr(Math.abs(diff))} ${diff < 0 ? 'short' : 'over'}`, tone: 'warn' };
}

export interface CloseInput {
  readonly orders: readonly Order[]; readonly dayId: string; readonly rec: CloseRecord; readonly locks: Readonly<Record<string, DayLock>>;
}
/** Each step's state. Unpaid counts every day's unpaid orders (the Unpaid tab); refunds due are this day's cancels. */
export function closeSteps({ orders, dayId, rec, locks }: CloseInput): Record<StepId, StepState> {
  const skip = (k: Skippable, done: boolean): StepState => (done ? 'done' : rec.skipped.includes(k) ? 'skipped' : 'todo');
  return {
    unpaid: skip('unpaid', unpaidOrders(orders).length === 0),
    refunds: skip('refunds', refundsDue(orders.filter((o) => o.dayId === dayId)).length === 0),
    cash: skip('cash', rec.counted !== null),
    notes: rec.text.trim() || rec.tags.length ? 'done' : 'todo',
    lock: locks[dayId]?.locked === true ? 'done' : 'todo',
  };
}

/** Plain text for Hold to share (no images: Q-RECEIPT-SYNC C draws from data). */
export function summaryText(stall: string, day: Pick<Day, 'label'>, s: DaySummary, counted: Paise | null, rec: CloseRecord): string {
  const cash = cashCheck(counted, s.book);
  const lines = [
    `${stall || 'Fair stall'} · ${day.label}`,
    `Orders ${String(s.orders)}${s.cancelled ? ` (+${String(s.cancelled)} cancelled)` : ''} · Takings ${formatInr(s.takings)}`,
    `Cash ${formatInr(s.cash)} · UPI ${formatInr(s.upi)}`,
    s.tips ? `Tips ${formatInr(s.tips)} (own pot)` : '',
    s.refunds ? `Refunds ${formatInr(s.refunds)}` : '',
    s.waived ? `Waived ${formatInr(s.waived)}` : '',
    s.writtenOff.n ? `Written off ${formatInr(s.writtenOff.amount)} (${String(s.writtenOff.n)})` : '',
    s.unpaid.n ? `Still unpaid ${formatInr(s.unpaid.amount)} (${String(s.unpaid.n)})` : '',
    `Spent ${formatInr(s.spent)} · Received ${formatInr(s.received)}`,
    `Cash in the box: ${counted === null ? 'not counted' : `${formatInr(counted)} · ${cash.text}`}`,
    s.top.length ? `Top: ${s.top.map((t) => `${t.name} ×${String(t.qty)}`).join(', ')}` : '',
    rec.skipped.length ? `Skipped: ${rec.skipped.join(', ')}` : '',
    rec.text || rec.tags.length ? `Notes: ${[rec.tags.join(', '), rec.text].filter(Boolean).join(' · ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
