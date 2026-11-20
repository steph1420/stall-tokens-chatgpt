// 2.1.0 P1 store rules (plan §6): newOrder reuse (W-07/W-14), resume after reload (W-12), day rollover (W-22),
// cancel gives availability back (W-32), drafts from every Counter hold stock (Q-DRAFT-SYNC, W-11), station filter
// (W-36), Complete + Refund actions, device registry + range clash, first-start migration, unknown kinds, sync.
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, isValidOp, type Op } from '../contract';
import { createFakeHub, createMemoryOpStore } from '../data';
import { DEMO_MENU, opMaker } from '../mock/fixtures';
import { bill, completed, day, isOpen, kitchen, liveOrders, orderStatus, unpaidOrders, writtenOff } from '.';
import { makeTestStore, memoryStorage } from './testkit';

/** Test-only: fail loudly instead of a non-null assertion. */
const must = <T,>(x: T | null | undefined): T => { if (x === null || x === undefined) throw new Error('missing'); return x; };

const flush = () => new Promise((r) => setTimeout(r, 0));
const H = 3_600_000;
const T16 = Date.UTC(2026, 10, 16, 10, 0); // 16 Nov 15:30 IST

async function ready(opts: Parameters<typeof makeTestStore>[0] = {}) {
  const t = makeTestStore(opts);
  await t.store.getState().start();
  const s = () => t.store.getState();
  return { ...t, s };
}
type S = Awaited<ReturnType<typeof ready>>['s'];
function seed(s: S) {
  const ids: Record<string, string> = {};
  for (const m of DEMO_MENU) {
    s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: m.count });
    ids[m.itemId] = Object.values(s().folded.items).find((i) => i.name === m.name)?.id ?? '';
  }
  return ids;
}
const cur = (s: S) => { const o = s().folded.orders[s().ui.orderId ?? '']; if (!o) throw new Error('no current order'); return o; };
const payAll = (s: S) => { const d = bill.due(cur(s)); return s().counter.pay({ cash: d, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: d, notes: {} }); };

describe('Counter flow rules (P1)', () => {
  it('+ New order reuses an empty current draft: no burnt tokens, no stranded drafts (W-07, W-14)', async () => {
    const { s } = await ready();
    const id = seed(s);
    const a = s().counter.newOrder();
    expect(s().counter.newOrder()).toBe(a);
    expect(s().counter.newOrder()).toBe(a);
    expect(liveOrders(s().folded)).toHaveLength(1);
    s().counter.addItem(id.tea ?? '');
    const b = s().counter.newOrder();
    expect(b).not.toBe(a);
    expect(s().folded.orders[b]?.token).toBe(2);
  });
  it('reload reopens the order in progress and its page (W-12); a finished one is not reopened', async () => {
    const storage = memoryStorage();
    const ops = createMemoryOpStore();
    const one = await ready({ storage, ops });
    const id = seed(one.s);
    one.s().counter.addItem(id.samosa ?? ''); one.s().counter.addItem(id.samosa ?? '');
    one.s().counter.setPage('billing');
    const oid = one.s().ui.orderId;
    await flush();
    const two = await ready({ storage, ops, idPrefix: 'dev00001-r2' });
    expect(two.s().ui.orderId).toBe(oid);
    expect(two.s().ui.pages[oid ?? '']).toBe('billing');
    expect(cur(two.s).lines[0]?.qty).toBe(2);
    two.s().counter.sendToKitchen(); expect(payAll(two.s)).toBeNull();
    two.s().open.handOverAll(oid ?? '');
    await flush();
    const three = await ready({ storage, ops, idPrefix: 'dev00001-r3' });
    expect(three.s().ui.orderId).toBeNull(); // completed: Counter starts fresh
  });
  it('day rollover (W-22): same IST date keeps the day; a new date asks while the old day is open; a closed day rolls over', async () => {
    let now = T16;
    const { s } = await ready({ now: () => now });
    const id = seed(s);
    s().counter.addItem(id.tea ?? '');
    const d1 = cur(s).dayId;
    expect(s().counter.dayCheck()).toBe('same');
    now = T16 + 20 * H; // 17 Nov 11:30 IST
    expect(s().counter.dayCheck()).toBe('ask');
    // P2: + New order asks first (new-day sheet); nothing is made until it is answered.
    expect(s().counter.newOrder()).toBe('');
    expect(s().ui.sheet?.kind).toBe('newDay');
    s().counter.answerDay(false); // "Keep yesterday's day": not asked again today
    const o2 = s().counter.newOrder();
    expect(s().folded.orders[o2]?.dayId).toBe(d1);
    const d2 = s().counter.startToday(); // "Start today (tokens from #001)"
    s().counter.addItem(id.tea ?? '');
    const o3 = cur(s);
    expect(o3.dayId).toBe(d2);
    expect(o3.token).toBe(1);
    expect(s().counter.dayCheck()).toBe('same');
  });
  it('a closed (locked) day from an earlier date rolls over by itself, tokens from #001', async () => {
    const mk = opMaker('old00000.x');
    const ops = createMemoryOpStore([
      mk('day.start', { dayId: 'd16', label: '2026-11-16' }, { wallAt: T16 }),
      mk('day.lock', { dayId: 'd16', locked: true, split: {} }, { wallAt: T16 + H }),
    ]);
    const { s } = await ready({ ops, now: () => T16 + 20 * H });
    expect(s().counter.dayCheck()).toBe('new');
    const o = s().counter.newOrder();
    expect(s().folded.orders[o]?.dayId).not.toBe('d16');
    expect(s().folded.orders[o]?.token).toBe(1);
    expect(day.rollover([], {}, T16)).toBe('none');
  });
  it('cancelling gives availability back (W-32); drafts from another Counter hold stock (W-11, Q-DRAFT-SYNC)', async () => {
    const hub = createFakeHub();
    const A = await ready({ hub, device: 'devAAAAA' });
    const B = await ready({ hub, device: 'devBBBBB' });
    const id = seed(A.s);
    const cold = id.colddrink ?? '';
    await A.s().syncNow(); await B.s().syncNow();
    A.s().counter.addItem(cold); A.s().counter.addItem(cold);
    expect(A.s().counter.available(cold)).toBe(1);
    A.s().counter.sendToKitchen();
    expect(A.s().folded.items[cold]?.count).toBe(1);
    expect(A.s().counter.cancelOrder(cur(A.s).id, '')).toBe(true);
    expect(A.s().folded.items[cold]?.count).toBe(3);
    expect(A.s().counter.available(cold)).toBe(3); // was 1 before the fix (cancelled lines counted as drafts)
    A.s().counter.addItem(cold); // a draft on A
    await A.s().syncNow(); await B.s().syncNow();
    expect(B.s().counter.available(cold)).toBe(2);
    expect(B.s().folded.orders[A.s().ui.orderId ?? '']?.device).toBe('devA'); // whose draft it is
  });
  it('station filter = stationOrders (W-36): a station\'s finished order leaves its filter', async () => {
    const { s } = await ready();
    const id = seed(s);
    s().counter.addItem(id.tea ?? ''); s().counter.addItem(id.samosa ?? ''); s().counter.sendToKitchen();
    const o = cur(s);
    const tea = o.lines.find((l) => l.name === 'Tea')?.lineId ?? '';
    s().kitchen.finishLine(o.id, tea); s().kitchen.advance(o.id, tea); // Beverages hands Tea over
    const all = liveOrders(s().folded);
    expect(kitchen.stationOrders(all, 'Beverages')).toEqual([]);
    expect(kitchen.stationOrders(all, 'Cutlets').map((x) => x.id)).toEqual([o.id]);
  });
});

describe('Complete and Refund actions (Q-HANDOVER-PAY, Q-COMPLETE-2 A, Q-REFUND-1 A)', () => {
  it('handover unpaid → Unpaid; Complete refused until the hold; completeUnpaid writes it off; payment clears it', async () => {
    const { s } = await ready();
    const id = seed(s);
    s().counter.addItem(id.tea ?? ''); s().counter.sendToKitchen();
    const oid = cur(s).id;
    expect(s().open.handOverAll(oid)).toBe(true);
    expect(s().ui.toast?.text).toBe('Handed over #001 · ₹20 still to collect');
    expect(s().open.handOverAll(oid)).toBe(false); // double tap (W-09): nothing more to hand over
    expect(unpaidOrders(liveOrders(s().folded)).map((o) => o.id)).toEqual([oid]);
    expect(s().open.complete(oid)).toBe('unpaid');
    expect(s().ui.toast?.text).toBe('Order unpaid · Press and hold to complete without payment');
    expect(s().open.completeUnpaid(oid, ' left without paying ')).toBe(true);
    expect(s().open.completeUnpaid(oid)).toBe(false); // once
    const o = must(s().folded.orders[oid]);
    expect(writtenOff(o)).toBe(true);
    expect(o.complete).toMatchObject({ unpaid: true, dueAt: 2000, reason: 'left without paying' });
    expect(unpaidOrders(liveOrders(s().folded))).toEqual([]);
    s().counter.selectOrder(oid);
    expect(payAll(s)).toBeNull(); // they came back and paid
    expect(writtenOff(must(s().folded.orders[oid]))).toBe(false);
    expect(completed(must(s().folded.orders[oid]))).toBe(true);
  });
  it('instant refund with back to stock, then Undo; refunds never cancel; over-refund refused', async () => {
    const { s } = await ready();
    const id = seed(s);
    const tea = id.tea ?? '';
    s().counter.addItem(tea); s().counter.addItem(tea); s().counter.sendToKitchen();
    expect(payAll(s)).toBeNull();
    const o = cur(s);
    expect(s().folded.items[tea]?.count).toBe(22);
    const r = s().refund.refund({ orderId: o.id, ask: { kind: 'lines', lines: [{ lineId: o.lines[0]?.lineId ?? '', qty: 1 }] }, source: 'cash', reason: 'Spilled', restock: true });
    expect(r).toMatchObject({ ok: true, amount: 2000 });
    expect(s().folded.items[tea]?.count).toBe(23);
    expect(s().folded.orders[o.id]?.cancel).toBeNull();
    expect(s().refund.refund({ orderId: o.id, ask: { kind: 'custom', amount: 2001 }, source: 'cash', reason: '', restock: false })).toEqual({ ok: false, reason: 'At most ₹20 can be refunded' });
    if (r.ok) expect(s().refund.undo(o.id, r.refundId)).toBe(true);
    if (r.ok) expect(s().refund.undo(o.id, r.refundId)).toBe(false);
    expect(s().folded.items[tea]?.count).toBe(22);
    expect(bill.paid(must(s().folded.orders[o.id]))).toBe(4000);
    expect(s().refund.refund({ orderId: 'nope', ask: { kind: 'whole' }, source: 'cash', reason: '', restock: false })).toEqual({ ok: false, reason: 'No such order' });
  });
  it('Ready (marked by the Counter) never takes an order off Open Orders', async () => {
    const { s } = await ready();
    const id = seed(s);
    s().counter.addItem(id.tea ?? ''); s().counter.sendToKitchen(); expect(payAll(s)).toBeNull();
    const o = cur(s);
    s().kitchen.finishLine(o.id, o.lines[0]?.lineId ?? '');
    expect(isOpen(must(s().folded.orders[o.id]))).toBe(true);
    expect(orderStatus(must(s().folded.orders[o.id]), undefined)).toBe('Ready');
  });
});

describe('device registry, migration and forward compatibility (Q-SYNC-ALL)', () => {
  it('first start registers the device once and shares its looks only when no shared value exists', async () => {
    const hub = createFakeHub();
    const A = await ready({ hub, device: 'devAAAAA' });
    expect(A.s().folded.devices['devAAAAA-id']).toMatchObject({ rangeIndex: 0, label: 'devA' });
    expect(A.s().folded.settings).toMatchObject({ autoPrep: 'true', stationLook: 'full', openLook: 'lines' });
    A.s().setPrefs({ stationLook: 'ticket' });
    await A.s().syncNow();
    const B = makeTestStore({ hub, device: 'devBBBBB' });
    B.store.getState().setPrefs({ stationLook: 'items' });
    await B.store.getState().syncNow(); // pull A's settings before starting
    await B.store.getState().start();
    await B.store.getState().syncNow();
    expect(B.store.getState().folded.settings.stationLook).toBe('full'); // the first device's choice wins
    expect(Object.keys(B.store.getState().folded.devices).sort()).toEqual(['devAAAAA-id', 'devBBBBB-id']);
    const n = B.store.getState().folded.applied.size;
    await B.store.getState().start(); // a second start writes nothing new
    expect(B.store.getState().folded.applied.size).toBe(n);
  });
  it('two Counters on the same token range: a Conflict row (range-clash), not silent', async () => {
    const hub = createFakeHub();
    const A = await ready({ hub, device: 'devAAAAA' });
    const B = await ready({ hub, device: 'devBBBBB' });
    await A.s().syncNow(); await B.s().syncNow(); await A.s().syncNow();
    const clashes = A.s().folded.conflicts.filter((c) => c.rule === 'range-clash');
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ target: 'range:0', field: 'rangeIndex' });
    expect(B.s().folded.conflicts.filter((c) => c.rule === 'range-clash')).toEqual(clashes);
  });
  it('an op of an unknown kind from a newer app is kept in the log, synced on, and folds as a no-op', async () => {
    const future = { v: CONTRACT_VERSION, opId: 'zzzz.1:1', writer: 'zzzz.1', seq: 1, lamport: 99, vv: {}, wallAt: 0, kind: 'tip.pool', body: { amount: 5 } } as unknown as Op;
    expect(isValidOp(future)).toBe(true);
    const { s, ops } = await ready({ ops: createMemoryOpStore([future]) });
    expect(s().folded.applied.has('zzzz.1:1')).toBe(true);
    expect(ops.all.some((o) => o.opId === 'zzzz.1:1')).toBe(true);
    expect(s().folded.orders).toEqual({});
    expect(s().folded.lamport).toBeGreaterThanOrEqual(99); // later local ops still sort after it
  });
});
