// 2.1.0 P4 (F-64..F-68): History rows and tags (W-08, W-18, W-21), search, Money unpaid / written off / refunds (F-65),
// Close the day steps, cash check, summary and lock (F-66), day notes (F-67), count-only restock (W-23, F-68), Extras switches.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { DEMO_MENU } from '../mock/fixtures';
import { bill, closing, extraOn, history, liveOrders, money } from '.';
import { makeTestStore } from './testkit';

async function ready() {
  const t = makeTestStore();
  await t.store.getState().start();
  return () => t.store.getState();
}
type S = Awaited<ReturnType<typeof ready>>;
function seed(s: S) {
  const ids: Record<string, string> = {};
  for (const m of DEMO_MENU) {
    s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: m.count });
    ids[m.itemId] = Object.values(s().folded.items).find((i) => i.name === m.name)?.id ?? '';
  }
  return ids;
}
const pay = (s: S, cash: number, upi = 0, tip = 0) => s().counter.pay({ cash, upi, upiPayeeId: null, tip, waived: 0, waivedBy: '', waivedNote: '', cashGiven: cash, notes: {} });
/** One order: items, sent, optionally paid in cash. Returns its id. */
function order(s: S, items: readonly string[], paid: 'cash' | 'upi' | 'none') {
  s().counter.newOrder();
  for (const i of items) s().counter.addItem(i);
  s().counter.sendToKitchen();
  const id = s().ui.orderId ?? '';
  const o = s().folded.orders[id];
  if (o && paid !== 'none') { const d = bill.due(o); if (paid === 'cash') pay(s, d); else pay(s, 0, d); }
  return id;
}
const tag = (s: S, id: string) => { const o = s().folded.orders[id]; if (!o) throw new Error('missing order'); return history.historyTag(o).text; };

describe('P4 History (F-64)', () => {
  it('lists every sent order with one plain tag (W-08, W-21)', async () => {
    const s = await ready(); const id = seed(s);
    const paidCash = order(s, [id.tea ?? '', id.tea ?? ''], 'cash');
    const paidUpi = order(s, [id.samosa ?? ''], 'upi');
    const unpaid = order(s, [id.vadapav ?? ''], 'none');
    const off = order(s, [id.coffee ?? ''], 'none');
    s().open.completeUnpaid(off);
    const refunded = order(s, [id.samosa ?? ''], 'cash');
    s().refund.quick(refunded);
    const cancelled = order(s, [id.tea ?? ''], 'cash');
    s().counter.cancelOrder(cancelled, 'Changed mind');
    s().counter.newOrder(); s().counter.addItem(id.tea ?? ''); // a draft: never in History
    expect(tag(s, paidCash)).toBe('Paid cash');
    expect(tag(s, paidUpi)).toBe('Paid UPI');
    expect(tag(s, unpaid)).toBe('Unpaid ₹25');
    expect(tag(s, off)).toBe('Written off ₹30');
    expect(tag(s, refunded)).toBe('Refunded ₹15 cash');
    expect(tag(s, cancelled)).toBe('Cancelled · Refund due ₹20');
    s().money.refundCancelled(cancelled, 'upi');
    expect(tag(s, cancelled)).toBe('Cancelled · Refunded ₹20 UPI');
    const dayId = s().folded.days[0]?.id ?? '';
    expect(history.historyOrders(Object.values(s().folded.orders), dayId)).toHaveLength(6);
  });
  it('finds an order by token, item or client; "#004", "4" and "004" are the same token', async () => {
    const s = await ready(); const id = seed(s);
    for (let i = 0; i < 3; i += 1) order(s, [id.tea ?? ''], 'cash');
    const four = order(s, [id.vadapav ?? ''], 'cash');
    s().open.setClient(four, 'Red shirt');
    const o = s().folded.orders[four];
    if (!o) throw new Error('missing');
    for (const q of ['#004', '4', '004', 'vada', 'RED', '']) expect(history.matchOrder(o, q)).toBe(true);
    for (const q of ['40', 'samosa', '#5']) expect(history.matchOrder(o, q)).toBe(false);
  });
});

describe('P4 Money and Close the day (F-65, F-66)', () => {
  it('Money counts unpaid on every day, write-offs today, and refunds apart from sales', async () => {
    const s = await ready(); const id = seed(s);
    const a = order(s, [id.tea ?? ''], 'cash');
    order(s, [id.vadapav ?? ''], 'none');
    const off = order(s, [id.coffee ?? ''], 'none');
    s().open.completeUnpaid(off);
    s().refund.quick(a);
    const f = s().folded;
    const d = money.dayMoney(liveOrders(f), f.entries, f.days[0]?.id ?? '');
    expect(d.unpaid).toEqual({ amount: 2500, n: 1 });
    expect(d.writtenOff).toEqual({ amount: 3000, n: 1 });
    expect([d.cashSales, d.refunds.cash]).toEqual([2000, 2000]);
  });
  it('walks the checklist: skip, count cash, notes, lock; the summary says what was left', async () => {
    const s = await ready(); const id = seed(s);
    s().money.openStall(50000);
    const dayId = s().folded.days[0]?.id ?? '';
    order(s, [id.tea ?? '', id.tea ?? '', id.samosa ?? ''], 'cash');
    order(s, [id.vadapav ?? ''], 'none');
    const steps = () => closing.closeSteps({ orders: liveOrders(s().folded), dayId, rec: closing.closeRecord(s().folded.records.day_note?.[dayId]), locks: s().folded.locks });
    expect(steps()).toEqual({ unpaid: 'todo', refunds: 'done', cash: 'todo', notes: 'todo', lock: 'todo' });
    s().close.skip(dayId, 'unpaid', true);
    s().close.setCounted(dayId, 50000 + 5500 - 2000);
    s().close.setNotes(dayId, ' Rain at 7 ', ['Weather', 'Crowd']);
    expect(s().close.lockDay(dayId)).toBe(true);
    expect(s().close.lockDay(dayId)).toBe(false);
    expect(steps()).toEqual({ unpaid: 'skipped', refunds: 'done', cash: 'done', notes: 'done', lock: 'done' });
    const rec = closing.closeRecord(s().folded.records.day_note?.[dayId]);
    expect(rec).toEqual({ counted: 53500, skipped: ['unpaid'], text: 'Rain at 7', tags: ['Weather', 'Crowd'] });
    const sum = closing.daySummary(liveOrders(s().folded), s().folded.entries, dayId, 50000);
    expect([sum.orders, sum.takings, sum.book, sum.unpaid.n]).toEqual([2, 5500, 55500, 1]);
    expect(closing.cashCheck(rec.counted, sum.book).text).toBe('₹20 short');
    expect(sum.top[0]).toEqual({ name: 'Tea', qty: 2, amount: 4000 });
    const text = closing.summaryText('Momo Stop', { label: '2026-11-16' }, sum, rec.counted, rec);
    expect(text).toContain('Cash in the box: ₹535 · ₹20 short');
    expect(text).toContain('Skipped: unpaid');
    expect(text).toContain('Notes: Weather, Crowd · Rain at 7');
    s().close.setCounted(dayId, null);
    expect(closing.closeRecord(s().folded.records.day_note?.[dayId]).counted).toBeNull();
  });
  it('locks through the partner split when partners exist (refused while shares are off)', async () => {
    const s = await ready(); seed(s);
    s().money.openStall(0);
    const dayId = s().folded.days[0]?.id ?? '';
    const p = s().money.savePerson(null, 'Asha', { isPartner: true, sharePct: 60 }) ?? '';
    expect(p).not.toBe('');
    expect(s().close.lockDay(dayId)).toBe(false);
    s().settle.setPartner(p, true, 100);
    expect(s().close.lockDay(dayId)).toBe(true);
  });
  it('Extras are on by default when never touched; an explicit off stays off (Q-P4-EXTRAS-ON A)', async () => {
    const s = await ready();
    expect(s().folded.settings[CONFIG.extras.closeDay]).toBeUndefined();
    expect(extraOn(s().folded.settings, 'closeDay')).toBe(true);
    expect(extraOn(s().folded.settings, 'historySearch')).toBe(true);
    s().close.setExtra('closeDay', false);
    expect(s().folded.settings[CONFIG.extras.closeDay]).toBe('0');
    expect(extraOn(s().folded.settings, 'closeDay')).toBe(false);
    expect(extraOn(s().folded.settings, 'historySearch')).toBe(true);
    s().close.setExtra('closeDay', true);
    expect(s().folded.settings[CONFIG.extras.closeDay]).toBe('1');
    expect(extraOn(s().folded.settings, 'closeDay')).toBe(true);
  });
});

describe('P4 Stock (F-68, W-23)', () => {
  it('"Tea 20pcs" tops up Tea with no Spent entry; a priced line still spends', async () => {
    const s = await ready(); const id = seed(s);
    const before = s().folded.items[id.tea ?? '']?.count ?? 0;
    const lines = (t: string) => t.split('\n').map((l) => l.trim());
    expect(s().stock.paste(lines('Tea 20pcs').map((l) => ({ ...parse(l) })), [{ source: 'register', personId: null, amount: 0 }])).toBeNull();
    expect(s().folded.items[id.tea ?? '']?.count).toBe(before + 20);
    expect(s().folded.entries).toHaveLength(0);
    expect(s().stock.paste([parse('Mystery 5')], [{ source: 'register', personId: null, amount: 0 }])).toBe('Nothing to add yet');
    expect(s().stock.paste([parse('Tea 4'), parse('Cold Drink 2 pcs 60')], [{ source: 'register', personId: null, amount: 6000 }])).toBeNull();
    expect(s().folded.entries.map((e) => [e.amount, e.label])).toEqual([[6000, 'Stock · 1 item']]);
  });
});
import { parseLine as parse } from './rules/stock';
