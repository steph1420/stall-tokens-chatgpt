// 2.1.0 P1 (plan §6): Q-REFUND-1 A data + Q-REFUND-INSTANT. Whole / lines / custom; never more than is held;
// back-to-stock applied once; Undo (refund.void) reverses it; a refund never cancels the order.
import { describe, expect, it } from 'vitest';
import { compareOps, type Bodies, type Op, type OpKind, type RefundLine, type VV } from '../../contract';
import { due, held, paid } from '../rules/bill';
import { planRefund } from '../refund';
import { isOpen } from '../rules/status';
import { fold } from './fold';

/** Test-only: fail loudly instead of a non-null assertion. */
const must = <T,>(x: T | null | undefined): T => { if (x === null || x === undefined) throw new Error('missing'); return x; };

const T0 = 1_794_800_000_000;
function op<K extends OpKind>(writer: string, seq: number, lamport: number, vv: VV, kind: K, body: Bodies[K]): Op {
  return { v: 2, opId: `${writer}:${String(seq)}`, writer, seq, lamport, vv, wallAt: T0, kind, body } as Op;
}
const A = 'aaaa.1';
const B = 'bbbb.1';
let n = 0;
const a = <K extends OpKind>(kind: K, body: Bodies[K]) => { n += 1; return op(A, n, n, { [A]: n - 1 }, kind, body); };
/** Tea ×3 (₹20, stock 10) paid ₹60 cash, sent. */
function base(): Op[] {
  n = 0;
  return [
    a('item.set', { itemId: 'tea', fields: { name: 'Tea', price: 2000, count: 10 } }),
    a('order.create', { orderId: 'o1', dayId: 'd1', token: 1, servedBy: '' }),
    a('line.add', { orderId: 'o1', lineId: 'l1', itemId: 'tea', name: 'Tea', price: 2000, category: 'Tea', stationId: 'Beverages', qty: 3 }),
    a('payment.add', { paymentId: 'p1', orderId: 'o1', cash: 6000, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 6000, notes: {} }),
  ];
}
const refund = (id: string, amount: number, lines: RefundLine[] = [], restock = false, w = A, seq?: number, lamport?: number, vv?: VV) => {
  if (w === A) { n += 1; return op(A, n, n, { [A]: n - 1 }, 'refund.add', { refundId: id, orderId: 'o1', amount, source: 'cash', reason: 'Wrong item', lines, restock }); }
  return op(w, seq ?? 1, lamport ?? 1, vv ?? {}, 'refund.add', { refundId: id, orderId: 'o1', amount, source: 'cash', reason: '', lines, restock });
};
const voidOp = (id: string) => { n += 1; return op(A, n, n, { [A]: n - 1 }, 'refund.void', { refundId: id, orderId: 'o1', reason: 'Undo' }); };
const st = (ops: Op[]) => fold([...ops].sort(compareOps));

describe('refunds (Q-REFUND-1 A)', () => {
  it('lines refund with back to stock: stock returns once, the order stays (not cancelled)', () => {
    const b = base();
    const s0 = st(b);
    expect(s0.items.tea?.count).toBe(7);
    const r = refund('r1', 2000, [{ lineId: 'l1', qty: 1 }], true);
    const s1 = st([...b, r, r]); // duplicate delivery
    expect(s1.items.tea?.count).toBe(8);
    expect(s1.orders.o1?.refunds).toHaveLength(1);
    expect(s1.orders.o1?.refunds[0]).toMatchObject({ reason: 'Wrong item', restocked: [{ lineId: 'l1', qty: 1 }], voided: null });
    expect(s1.orders.o1?.cancel).toBeNull();
    expect(paid(must(s1.orders.o1))).toBe(4000);
  });
  it('back to stock is capped by what the line took out of stock', () => {
    const b = base();
    const s = st([...b, refund('r1', 2000, [{ lineId: 'l1', qty: 2 }], true), refund('r2', 2000, [{ lineId: 'l1', qty: 5 }], true)]);
    expect(s.items.tea?.count).toBe(10); // 7 + 3, never more than the 3 committed
    expect(s.orders.o1?.lines[0]?.restocked).toBe(3);
  });
  it('can not refund more than is held; two phones refunding at once: the later one is capped', () => {
    const b = base();
    const s = st([...b, refund('r1', 9999)]);
    expect(s.orders.o1?.refunds[0]?.amount).toBe(6000);
    const fromA = refund('rA', 6000);
    const fromB = refund('rB', 6000, [], false, B, 1, fromA.lamport, { [A]: fromA.lamport - 1 });
    const x = st([...b, fromA, fromB]); const y = st([...b, fromB, fromA]);
    expect(x.orders.o1).toEqual(y.orders.o1);
    expect(held(must(x.orders.o1))).toBe(0);
    expect(x.orders.o1?.refunds.map((r) => r.amount).sort()).toEqual([0, 6000]);
  });
  it('Undo (refund.void) keeps the record, gives nothing back and takes the stock out again; once only', () => {
    const b = base();
    const r = refund('r1', 2000, [{ lineId: 'l1', qty: 1 }], true);
    const v = voidOp('r1');
    const s = st([...b, r, v, voidOp('r1')]);
    const o = must(s.orders.o1);
    expect(o.refunds[0]?.voided).toBe('Undo');
    expect(s.items.tea?.count).toBe(7);
    expect(o.lines[0]?.restocked).toBe(0);
    expect(paid(o)).toBe(6000);
    expect(due(o)).toBe(0);
    expect(isOpen(o)).toBe(true); // sent, not handed over yet
  });
  it('a void for an unknown refund, or before the refund arrives, changes nothing', () => {
    const b = base();
    const s = st([...b, voidOp('nope')]);
    expect(s.orders.o1?.refunds).toEqual([]);
  });
  it('a cancelled order still takes a refund and its Undo', () => {
    const b = base();
    n += 1; const c = op(A, n, n, { [A]: n - 1 }, 'order.cancel', { orderId: 'o1', reason: '' });
    const r = refund('r1', 6000);
    const s = st([...b, c, r, voidOp('r1')]);
    expect(s.orders.o1?.refunds[0]?.voided).toBe('Undo');
    expect(s.orders.o1?.cancel?.refundDue).toBe(6000);
  });
  it('old 2.0.0 refunds (no reason, lines or restock) read as reason "", no lines, no restock', () => {
    const b = base();
    n += 1;
    const old = op(A, n, n, { [A]: n - 1 }, 'refund.add', { refundId: 'r0', orderId: 'o1', amount: 1000, source: 'upi' });
    const r = st([...b, old]).orders.o1?.refunds[0];
    expect(r).toMatchObject({ reason: '', lines: [], restocked: [], voided: null, amount: 1000 });
  });
});

describe('planRefund (pure)', () => {
  const o = () => must(st(base()).orders.o1);
  it('whole, lines and custom', () => {
    expect(planRefund(o(), { kind: 'whole' })).toEqual({ amount: 6000, lines: [{ lineId: 'l1', qty: 3 }] });
    expect(planRefund(o(), { kind: 'lines', lines: [{ lineId: 'l1', qty: 2 }] })).toEqual({ amount: 4000, lines: [{ lineId: 'l1', qty: 2 }] });
    expect(planRefund(o(), { kind: 'custom', amount: 1500 })).toEqual({ amount: 1500, lines: [] });
  });
  it('refuses more than ordered or held, nothing picked, and junk amounts', () => {
    expect(planRefund(o(), { kind: 'lines', lines: [{ lineId: 'l1', qty: 4 }] })).toBe('Tea: that is more than was ordered');
    expect(planRefund(o(), { kind: 'lines', lines: [] })).toBe('Pick what to refund');
    expect(planRefund(o(), { kind: 'custom', amount: 6001 })).toBe('At most ₹60 can be refunded');
    for (const bad of [0, -5, Number.NaN, 1.5e300]) expect(typeof planRefund(o(), { kind: 'custom', amount: bad })).toBe('string');
  });
});
