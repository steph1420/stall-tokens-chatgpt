// 2.1.0 P1 (plan §6): Q-COMPLETE-2 A, Q-HANDOVER-PAY revised, write-offs, and Q-HARM-10 for Complete vs payment.
import { describe, expect, it } from 'vitest';
import { compareOps, type Bodies, type Op, type OpKind, type VV } from '../../contract';
import { completed, isOpen, openOrders, orderStatus, unpaid, unpaidOrders, writtenOff } from '../rules/status';
import { kitchenOrders, lineComplete, lineMuted } from '../rules/kitchen';
import { due } from '../rules/bill';
import { fold } from './fold';
import { liveOrders } from './fold';

/** Test-only: fail loudly instead of a non-null assertion. */
const must = <T,>(x: T | null | undefined): T => { if (x === null || x === undefined) throw new Error('missing'); return x; };

const DAY = 86_400_000;
const T0 = 1_794_800_000_000;
function op<K extends OpKind>(writer: string, seq: number, lamport: number, vv: VV, kind: K, body: Bodies[K], wallAt = T0): Op {
  return { v: 2, opId: `${writer}:${String(seq)}`, writer, seq, lamport, vv, wallAt, kind, body } as Op;
}
const A = 'aaaa.1';
const B = 'bbbb.1';
/** One sent order #1: Tea ₹20 + Samosa ₹15 = ₹35, written by A (seq 1..4, lamport 1..4). */
const base = (): Op[] => [
  op(A, 1, 1, {}, 'order.create', { orderId: 'o1', dayId: 'd1', token: 1, servedBy: '' }),
  op(A, 2, 2, { [A]: 1 }, 'line.add', { orderId: 'o1', lineId: 'l1', itemId: 'tea', name: 'Tea', price: 2000, category: 'Tea', stationId: 'Beverages', qty: 1 }),
  op(A, 3, 3, { [A]: 2 }, 'line.add', { orderId: 'o1', lineId: 'l2', itemId: 'sam', name: 'Samosa', price: 1500, category: 'Snacks', stationId: 'Cutlets', qty: 1 }),
  op(A, 4, 4, { [A]: 3 }, 'order.send', { orderId: 'o1' }),
];
const pay = (w: string, seq: number, lamport: number, vv: VV, amount: number, id = 'p1') =>
  op(w, seq, lamport, vv, 'payment.add', { paymentId: id, orderId: 'o1', cash: amount, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: amount, notes: {} });
const status = (w: string, seq: number, lamport: number, lineId: string, s: 'ready' | 'handed') =>
  op(w, seq, lamport, { [A]: seq - 1 }, 'line.status', { orderId: 'o1', lineId, status: s });
const finish = (seq: number, lamport: number, lineId: string) => op(A, seq, lamport, { [A]: seq - 1 }, 'line.finish', { orderId: 'o1', lineId });
const complete = (w: string, seq: number, lamport: number, vv: VV, unpaidFlag: boolean, dueAt: number) =>
  op(w, seq, lamport, vv, 'order.complete', { orderId: 'o1', unpaid: unpaidFlag, dueAt, reason: '' });
const order = (ops: Op[]) => { const o = fold([...ops].sort(compareOps)).orders.o1; if (!o) throw new Error('no order'); return o; };

describe('Q-COMPLETE-2 A: completion', () => {
  it('Ready never completes, whoever marks it (W-06): Counter-marked lines stay open and muted', () => {
    const o = order([...base(), finish(5, 5, 'l1'), finish(6, 6, 'l2')]);
    expect(o.lines.every((l) => l.status === 'ready' && l.byCounter)).toBe(true);
    expect(o.lines.some(lineComplete)).toBe(false);
    expect(o.lines.every(lineMuted)).toBe(true);
    expect(completed(o)).toBe(false);
    expect(isOpen(o)).toBe(true);
    expect(kitchenOrders([o]).map((x) => x.id)).toEqual(['o1']); // W-27: stays on kitchen / station views
    expect(orderStatus(o, undefined)).toBe('Ready');
  });
  it('Handover while unpaid does not complete (W-05, W-08): it stays open and in the Unpaid list', () => {
    const o = order([...base(), status(A, 5, 5, 'l1', 'handed'), status(A, 6, 6, 'l2', 'handed')]);
    expect(completed(o)).toBe(false);
    expect(unpaid(o)).toBe(true);
    expect(orderStatus(o, undefined)).toBe('Unpaid');
    expect(openOrders([o]).map((x) => x.id)).toEqual(['o1']);
    expect(unpaidOrders([o]).map((x) => x.id)).toEqual(['o1']);
    expect(kitchenOrders([o])).toEqual([]); // the kitchen is done with it
  });
  it('Handover + paid completes by itself, in either order', () => {
    const handed = [status(A, 5, 5, 'l1', 'handed'), status(A, 6, 6, 'l2', 'handed')];
    const paidFirst = order([...base(), pay(A, 5, 5, { [A]: 4 }, 3500), ...handed.map((h) => ({ ...h, seq: h.seq + 1, opId: `${A}:${String(h.seq + 1)}`, lamport: h.lamport + 1 }))]);
    const paidLast = order([...base(), ...handed, pay(A, 7, 7, { [A]: 6 }, 3500)]);
    for (const o of [paidFirst, paidLast]) {
      expect(completed(o)).toBe(true);
      expect(orderStatus(o, undefined)).toBe('Handed over');
      expect(openOrders([o])).toEqual([]);
      expect(unpaid(o)).toBe(false);
    }
  });
  it('Complete unpaid writes the order off; a later payment clears the write-off (money is never dropped)', () => {
    const off = [...base(), complete(A, 5, 5, { [A]: 4 }, true, 3500)];
    const o = order(off);
    expect(completed(o)).toBe(true);
    expect(writtenOff(o)).toBe(true);
    expect(unpaid(o)).toBe(false); // written off: not in the Unpaid tab
    expect(orderStatus(o, undefined)).toBe('Written off');
    expect(o.complete).toMatchObject({ unpaid: true, dueAt: 3500 });
    const later = order([...off, pay(A, 6, 6, { [A]: 5 }, 3500)]);
    expect(writtenOff(later)).toBe(false);
    expect(due(later)).toBe(0);
    expect(later.payments).toHaveLength(1);
    expect(orderStatus(later, undefined)).toBe('Done');
    const part = order([...off, pay(A, 6, 6, { [A]: 5 }, 1000)]);
    expect(writtenOff(part)).toBe(true); // still ₹25 not collected
    expect(due(part)).toBe(2500);
  });
  it('a paid order completes with one Complete even before handover; Complete twice is idempotent', () => {
    const c = complete(A, 6, 6, { [A]: 5 }, false, 0);
    const o = order([...base(), pay(A, 5, 5, { [A]: 4 }, 3500), c, c]);
    expect(completed(o)).toBe(true);
    expect(orderStatus(o, undefined)).toBe('Done');
  });
  it('a cancelled order ignores Complete; a deleted one ignores everything', () => {
    const cancelled = order([...base(), op(A, 5, 5, { [A]: 4 }, 'order.cancel', { orderId: 'o1', reason: '' }), complete(A, 6, 6, { [A]: 5 }, true, 3500)]);
    expect(cancelled.complete).toBeNull();
    expect(completed(cancelled)).toBe(false);
    expect(isOpen(cancelled)).toBe(false);
    const ops = fold([...base(), op(A, 5, 5, { [A]: 4 }, 'order.delete', { orderId: 'o1' }), complete(A, 6, 6, { [A]: 5 }, false, 0)]);
    expect(liveOrders(ops)).toEqual([]);
  });
});

describe('Q-HARM-10: Complete vs payment from two phones', () => {
  // Phone A writes the order off while phone B, offline and not having seen it, takes the money.
  const off = complete(A, 5, 5, { [A]: 4 }, true, 3500);
  const paid = pay(B, 1, 5, { [A]: 4 }, 3500);
  it('same result in any arrival order, never newest-timestamp-wins, and the clash is recorded', () => {
    const skewed = { ...paid, wallAt: T0 - DAY } as Op; // B's clock a day behind
    const x = fold([...base(), off, skewed].sort(compareOps));
    const y = fold([...base(), skewed, off].reverse().sort(compareOps));
    const xo = must(x.orders.o1); const yo = must(y.orders.o1);
    expect(xo).toEqual(yo);
    expect(xo.payments).toHaveLength(1); // the money is kept
    expect(writtenOff(xo)).toBe(false); // the payment covers it
    expect(completed(xo)).toBe(true);
    expect(x.conflicts).toEqual([expect.objectContaining({ target: 'order:o1', field: 'complete', rule: 'causal' })]);
    expect(x.conflicts).toEqual(y.conflicts);
  });
  it('a payment that had seen the Complete is not a clash', () => {
    const after = pay(B, 1, 6, { [A]: 5 }, 3500);
    expect(fold([...base(), off, after].sort(compareOps)).conflicts).toEqual([]);
  });
  it('a duplicate payment or Complete (same opId, delivered twice after an offline catch-up) counts once', () => {
    const s = fold([...base(), off, paid, paid, off].sort(compareOps));
    expect(s.orders.o1?.payments).toHaveLength(1);
    expect(s.conflicts).toHaveLength(1);
  });
  it('a gap in a writer\'s seqs is reported, and the fold catches up when the missing op arrives', () => {
    const p2 = pay(B, 2, 7, { [A]: 5, [B]: 1 }, 0, 'p2');
    const gap = fold([...base(), off, p2].sort(compareOps));
    expect(gap.gaps).toEqual({ [B]: 1 });
    const full = fold([...base(), off, paid, p2].sort(compareOps));
    expect(full.gaps).toEqual({});
    expect(due(must(full.orders.o1))).toBe(0);
  });
});
