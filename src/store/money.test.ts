// F-23..F-25 Money: Mixed parts must cover the amount (Q-MIXED-1); refunds due come from cancelled paid orders (Q-CANCEL-1 A).
import { describe, expect, it } from 'vitest';
import { liveOrders } from './fold/fold';
import { coverage, dayMoney, refundsDue } from './rules/money';
import { makeTestStore } from './testkit';

describe('money (F-23 F-24 F-25)', () => {
  it('saves Spent with Mixed only when the parts add up; Register parts move the register', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().counter.newOrder(); // starts the day
    const ravi = s().money.savePerson(null, 'Ravi') ?? '';
    expect(s().money.savePerson(null, 'ravi')).toBeNull();
    const parts = [{ source: 'register' as const, personId: null, amount: 15000 }, { source: 'person' as const, personId: ravi, amount: 5000 }];
    expect(coverage(parts, 25000).ok).toBe(false);
    expect(s().money.addEntry({ dir: 'spent', amount: 25000, label: 'Ice', kind: 'normal', parts, note: '', personId: null })).toMatch(/add up/);
    const ok = [parts[0], { ...parts[1], amount: 10000 }] as typeof parts;
    expect(s().money.addEntry({ dir: 'spent', amount: 25000, label: 'Ice', kind: 'normal', parts: ok, note: '', personId: null })).toBeNull();
    expect(s().money.addEntry({ dir: 'received', amount: 5000, label: 'Sponsor', kind: 'donation', parts: [{ source: 'register', personId: null, amount: 5000 }], note: '', personId: null })).toBeNull();
    const f = s().folded;
    const d = dayMoney(liveOrders(f), f.entries, f.days[0]?.id ?? '');
    expect([d.spent, d.received, d.donations, d.registerFlow]).toEqual([25000, 5000, 5000, -10000]);
  });

  it('a cancelled paid order shows as refund due until it is refunded (including tips, FIN-01)', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().catalog.saveItem(null, { name: 'Tea', price: 2000, swatch: 0, category: 'Tea', stationId: 'Beverages', count: null });
    const tea = Object.keys(s().folded.items)[0] ?? '';
    s().counter.newOrder(); s().counter.addItem(tea);
    // Paid with ₹500 tip (total ₹2500)
    expect(s().counter.pay({ cash: 2500, upi: 0, upiPayeeId: null, tip: 500, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 2500, notes: {} })).toBeNull();
    const oid = s().ui.orderId ?? '';
    s().counter.cancelOrder(oid, 'Left');
    // Refunds due must include the full ₹2500 held, not just ₹2000
    expect(refundsDue(Object.values(s().folded.orders)).map((r) => r.due)).toEqual([2500]);
    expect(s().money.refundCancelled(oid, 'cash')).toBe(true);
    expect(refundsDue(Object.values(s().folded.orders))).toHaveLength(0);
    expect(s().money.refundCancelled(oid, 'cash')).toBe(false);
  });
});
