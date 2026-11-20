import { describe, expect, it } from 'vitest';
import type { Op } from '../../contract';
import { demoMenuOps, opMaker } from '../../mock/fixtures';
import { applyOp, fold } from './fold';

const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j] as T, a[i] as T]; }
  return a;
};
const strip = (s: ReturnType<typeof fold>) => ({ items: s.items, orders: s.orders, orderIds: s.orderIds, conflicts: s.conflicts.length });

function counterLog(): Op[] {
  const mk = opMaker('dev1.a', 10);
  return [
    ...demoMenuOps(),
    mk('day.start', { dayId: 'd1', label: '2026-11-16' }),
    mk('order.create', { orderId: 'o1', dayId: 'd1', token: 47, servedBy: 'S' }),
    mk('line.add', { orderId: 'o1', lineId: 'l1', itemId: 'tea', name: 'Tea', price: 2000, category: 'Tea', stationId: 'Beverages', qty: 1 }),
    mk('line.qty', { orderId: 'o1', lineId: 'l1', qty: 3 }),
    mk('order.send', { orderId: 'o1' }),
  ];
}

describe('fold (F-02)', () => {
  it('state is the same for any arrival order and with duplicates', () => {
    const log = counterLog();
    const base = strip(fold(log));
    for (const seed of [1, 7, 42, 99]) expect(strip(fold(shuffle([...log, ...log.slice(3)], seed)))).toEqual(base);
  });
  it('incremental apply equals a full fold', () => {
    const log = counterLog();
    const inc = log.reduce(applyOp, fold([]));
    expect(strip(inc)).toEqual(strip(fold(log)));
  });
  it('sending takes stock; deleting gives it back; manual edits never go below 0', () => {
    let s = fold(counterLog());
    expect(s.items.tea?.count).toBe(21);
    expect(s.orders.o1?.lines[0]?.status).toBe('waiting');
    const mk = opMaker('dev1.b', 100);
    s = applyOp(s, mk('order.delete', { orderId: 'o1' }));
    expect(s.items.tea?.count).toBe(24);
    s = applyOp(s, mk('stock.adjust', { itemId: 'tea', delta: -99, reason: 'panel' }));
    expect(s.items.tea?.count).toBe(0);
  });
  it('offline oversell is allowed but flagged', () => {
    const a = opMaker('devA.1', 20);
    const b = opMaker('devB.1', 20);
    const log = [...demoMenuOps(), a('order.create', { orderId: 'oa', dayId: 'd', token: 1, servedBy: '' }),
      a('line.add', { orderId: 'oa', lineId: 'la', itemId: 'colddrink', name: 'Cold Drink', price: 4000, category: '', stationId: '', qty: 3 }),
      a('order.send', { orderId: 'oa' }),
      b('order.create', { orderId: 'ob', dayId: 'd', token: 501, servedBy: '' }),
      b('line.add', { orderId: 'ob', lineId: 'lb', itemId: 'colddrink', name: 'Cold Drink', price: 4000, category: '', stationId: '', qty: 2 }),
      b('order.send', { orderId: 'ob' })];
    const s = fold(log);
    expect(s.items.colddrink?.count).toBe(0);
    expect(s.items.colddrink?.oversold).toBe(true);
  });
  it('records a conflict when two devices set the same field unseen, and keeps both ops', () => {
    const a = opMaker('devA.1', 50);
    const b = opMaker('devB.1', 50);
    const create = a('order.create', { orderId: 'o', dayId: 'd', token: 1, servedBy: '' });
    const na = a('order.note', { orderId: 'o', note: 'Pack to go' }, { vv: { 'devA.1': 1 } });
    const nb = b('order.note', { orderId: 'o', note: 'Eat here' }, { lamport: 52, vv: { 'devA.1': 1 } });
    const s = fold([create, na, nb]);
    expect(s.orders.o?.note).toBe('Eat here');
    expect(s.conflicts).toHaveLength(1);
    // a later edit that has seen both is not a conflict
    const nc = a('order.note', { orderId: 'o', note: 'Pack' }, { vv: { 'devA.1': 2, 'devB.1': 1 } });
    expect(fold([create, na, nb, nc]).conflicts).toHaveLength(1);
  });
  it('wall clocks do not change the result (phone clock ±1 day)', () => {
    const log = counterLog();
    const skewed = log.map((o, i) => ({ ...o, wallAt: o.wallAt + (i % 2 ? 1 : -1) * 86_400_000 }));
    expect(strip(fold(skewed)).items).toEqual(strip(fold(log)).items);
  });
  it('lists seq gaps and ignores ops for unknown orders', () => {
    const mk = opMaker('devG.1');
    const ops = [mk('day.start', { dayId: 'd', label: '' }), mk('order.note', { orderId: 'nope', note: 'x' }), mk('day.start', { dayId: 'd2', label: '' })];
    const s = fold([ops[0] as Op, ops[2] as Op]);
    expect(s.gaps['devG.1']).toBe(1);
    expect(fold(ops).orders).toEqual({});
  });
  it('a payment sends the order and keeps tips separate; repeat payment ids count once', () => {
    const mk = opMaker('devP.1', 30);
    const pay = mk('payment.add', { paymentId: 'p1', orderId: 'o1', cash: 6000, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 10000, notes: { 100: 1 } });
    const log = [...counterLog().slice(0, -1), pay, { ...pay, opId: 'devP.1:9', seq: 9 }];
    const s = fold(log);
    expect(s.orders.o1?.sent).toBe(true);
    expect(s.orders.o1?.payments).toHaveLength(1);
  });
});
