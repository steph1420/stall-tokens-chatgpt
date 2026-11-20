import { describe, expect, it } from 'vitest';
import type { Order } from '../../contract';
import { discountAmount, discountCapped, due, paid, roundOffAmount, roundOffChoices, subtotal, tips, total } from './bill';

const line = (price: number, qty: number) => ({ lineId: String(price) + String(qty), itemId: 'i', name: 'x', price, category: '', stationId: '', qty, note: '', status: 'draft' as const, committed: 0, byCounter: false, restocked: 0 });
const order = (p: Partial<Order> = {}): Order => ({
  id: 'o', dayId: 'd', token: 47, servedBy: '', createdAt: 0, lines: [line(3000, 2), line(2500, 1), line(1500, 1)], note: '',
  discount: null, roundOff: null, sent: false, deleted: false, priority: false, client: '', cancel: null, payments: [], refunds: [], revision: 0, complete: null, device: '', handler: null, ...p,
});
const payment = (cash: number, upi: number, tip = 0, waived = 0) => ({ paymentId: 'p' + String(cash), cash, upi, upiPayeeId: null, tip, waived, waivedBy: '', waivedNote: '', cashGiven: 0, notes: {}, at: 0, writer: 'w' });

describe('bill (F-10 F-11 F-18)', () => {
  it('matches the locked billing mockup: ₹100 − ₹10 = ₹90', () => {
    const o = order({ discount: { kind: 'amount', value: 1000, allowedBy: 'S', note: '' } });
    expect(subtotal(o)).toBe(10000);
    expect(total(o)).toBe(9000);
  });
  it('percent discount rounds to the nearest rupee', () => {
    expect(discountAmount(10000, { kind: 'pct', value: 10, allowedBy: '', note: '' })).toBe(1000);
    expect(discountAmount(1250, { kind: 'pct', value: 10, allowedBy: '', note: '' })).toBe(100); // ₹1.25 -> ₹1
    expect(discountAmount(1550, { kind: 'pct', value: 10, allowedBy: '', note: '' })).toBe(200); // ₹1.55 -> ₹2
    expect(discountAmount(10000, { kind: 'pct', value: 250, allowedBy: '', note: '' })).toBe(10000);
  });
  it('caps a discount at the subtotal and says so', () => {
    const d = { kind: 'amount' as const, value: 50000, allowedBy: '', note: '' };
    expect(discountAmount(10000, d)).toBe(10000);
    expect(discountCapped(10000, d)).toBe(true);
    expect(total(order({ discount: d }))).toBe(0);
  });
  it('round-off works both ways and only against the total it was set for', () => {
    const up = order({ lines: [line(8700, 1)], roundOff: { amount: 300, forTotal: 8700 } });
    expect(total(up)).toBe(9000);
    const down = order({ lines: [line(8700, 1)], roundOff: { amount: -200, forTotal: 8700 } });
    expect(total(down)).toBe(8500);
    const stale = order({ lines: [line(8700, 2)], roundOff: { amount: -200, forTotal: 8700 } });
    expect(roundOffAmount(stale)).toBe(0);
    expect(total(stale)).toBe(17400);
    expect(roundOffChoices(8700, [500, 1000])).toEqual([-700, -200, 300]);
    expect(roundOffChoices(9000, [500, 1000])).toEqual([]);
  });
  it('tips stay out of sales; refunds reduce paid; due goes negative when owed', () => {
    const o = order({ payments: [payment(10000, 2000, 2000)] });
    expect(paid(o)).toBe(10000);
    expect(tips(o)).toBe(2000);
    expect(due(o)).toBe(0);
    const edited = order({ lines: [line(3000, 2)], payments: [payment(10000, 0)] });
    expect(due(edited)).toBe(-4000);
    expect(due({ ...edited, refunds: [{ refundId: 'r', amount: 4000, source: 'cash', at: 0, reason: '', lines: [], restocked: [], voided: null, settled: 4000 }] })).toBe(0);
    // Q-REFUND-INSTANT: a voided (Undo) refund gives nothing back.
    expect(due({ ...edited, refunds: [{ refundId: 'r', amount: 4000, source: 'cash', at: 0, reason: '', lines: [], restocked: [], voided: 'Undo', settled: 4000 }] })).toBe(-4000);
    expect(due(order({ payments: [payment(8000, 0, 0, 2000)] }))).toBe(0);
  });
  // D-P4-REFUND-DUE: a refund of goods (settled 0) never makes a paid order owed again; only the overpayment part counts.
  it('a refund of a paid bill leaves nothing to collect', () => {
    const r = (amount: number, settled: number) => ({ refundId: `r${String(amount)}`, amount, source: 'cash' as const, at: 0, reason: '', lines: [], restocked: [], voided: null, settled });
    const paidOrder = order({ payments: [payment(10000, 0, 0, 0)] });
    expect(due({ ...paidOrder, refunds: [r(10000, 0)] })).toBe(0);
    expect(due({ ...paidOrder, refunds: [r(3000, 0)] })).toBe(0);
    const edited = { ...paidOrder, lines: paidOrder.lines.map((l) => ({ ...l, qty: 1 })) };
    expect(due(edited)).toBe(-3000);
    expect(due({ ...edited, refunds: [r(5000, 3000)] })).toBe(0);
    expect(due({ ...edited, refunds: [r(2000, 2000)] })).toBe(-1000);
  });
});
