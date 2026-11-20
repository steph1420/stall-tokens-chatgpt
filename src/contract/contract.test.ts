import { describe, expect, it } from 'vitest';
import { compareOps, formatInr, isValidOp, parseRupees, rupees } from '.';
import { opMaker } from '../mock/fixtures';

describe('money (paise, en-IN)', () => {
  it('formats Indian grouping, decimals and negatives', () => {
    expect(formatInr(rupees(100))).toBe('₹100');
    expect(formatInr(rupees(1050))).toBe('₹1,050');
    expect(formatInr(rupees(99999999))).toBe('₹9,99,99,999');
    expect(formatInr(1250)).toBe('₹12.50');
    expect(formatInr(-1000)).toBe('−₹10');
    expect(formatInr(0)).toBe('₹0');
  });
  it('parses typed rupees and refuses junk', () => {
    expect(parseRupees('12.5')).toBe(1250);
    expect(parseRupees('₹1,200')).toBe(120000);
    expect(parseRupees('007')).toBe(700);
    expect(parseRupees('Rs 40')).toBe(4000);
    for (const bad of ['', '-5', '1e3', '12.345', 'abc', '१२']) expect(parseRupees(bad)).toBeNull();
  });
});

describe('op contract', () => {
  const mk = opMaker('dev1.a');
  it('accepts a well formed op and refuses bad ones', () => {
    const op = mk('order.note', { orderId: 'o1', note: 'Pack to go' });
    expect(isValidOp(op)).toBe(true);
    expect(isValidOp({ ...op, v: 1 })).toBe(false);
    expect(isValidOp({ ...op, opId: 'x:9' })).toBe(false);
    // Forward compatibility (2.1.0): a well-formed op of an unknown kind is kept (folds as a no-op); junk kinds are not.
    expect(isValidOp({ ...op, kind: 'future.kind' })).toBe(true);
    expect(isValidOp({ ...op, kind: 'DROP TABLES' })).toBe(false);
    expect(isValidOp({ ...op, kind: 'nodot' })).toBe(false);
    expect(isValidOp({ ...op, body: { orderId: 'o1', note: 5 } })).toBe(false);
    expect(isValidOp({ ...op, seq: 0, opId: 'dev1.a:0' })).toBe(false);
    expect(isValidOp(null)).toBe(false);
    expect(isValidOp('op')).toBe(false);
    const pay = mk('payment.add', { paymentId: 'p', orderId: 'o', cash: Number.NaN, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 0, notes: {} });
    expect(isValidOp(pay)).toBe(false);
  });
  it('2.1.0 kinds and optional fields (additive, contract stays v2)', () => {
    expect(isValidOp(mk('order.complete', { orderId: 'o', unpaid: true, dueAt: 2000, reason: '' }))).toBe(true);
    expect(isValidOp(mk('order.complete', { orderId: 'o', unpaid: 'yes', dueAt: 2000, reason: '' } as never))).toBe(false);
    expect(isValidOp(mk('refund.void', { refundId: 'r', orderId: 'o', reason: 'Undo' }))).toBe(true);
    expect(isValidOp(mk('device.set', { deviceId: 'd', label: 'Ravi · d', rangeIndex: 1, role: '' }))).toBe(true);
    expect(isValidOp(mk('snapshot.note', { snapshotId: 's', at: 1, reason: 'Before Reset', opCount: 10, hash: 'ab' }))).toBe(true);
    const base = { refundId: 'r', orderId: 'o', amount: 100, source: 'cash' as const };
    expect(isValidOp(mk('refund.add', base))).toBe(true); // a 2.0.0 refund
    expect(isValidOp(mk('refund.add', { ...base, reason: 'Cold', lines: [{ lineId: 'l', qty: 1 }], restock: true }))).toBe(true);
    expect(isValidOp(mk('refund.add', { ...base, lines: [{ lineId: 'l', qty: 0 }] }))).toBe(false);
    expect(isValidOp(mk('refund.add', { ...base, lines: [{ lineId: 5, qty: 1 }] } as never))).toBe(false);
    expect(isValidOp(mk('refund.add', { ...base, restock: 'yes' } as never))).toBe(false);
    expect(isValidOp(mk('order.create', { orderId: 'o', dayId: 'd', token: 1, servedBy: '', device: 'Ravi · ab12' }))).toBe(true);
    expect(isValidOp(mk('order.create', { orderId: 'o', dayId: 'd', token: 1, servedBy: '', device: 7 } as never))).toBe(false);
  });
  it('orders ops by lamport, then writer, then seq', () => {
    const a = opMaker('a.1')('order.note', { orderId: 'o', note: '' }, { lamport: 5 });
    const b = opMaker('b.1')('order.note', { orderId: 'o', note: '' }, { lamport: 5 });
    const c = opMaker('a.1')('order.note', { orderId: 'o', note: '' }, { lamport: 4 });
    expect([a, b, c].sort(compareOps).map((o) => o.writer + String(o.lamport))).toEqual(['a.14', 'a.15', 'b.15']);
  });
});
