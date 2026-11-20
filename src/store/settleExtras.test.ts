// F-47 Settle-up extras: fewest transfers (simplify debts) and the exact-amount split type.
import { describe, expect, it } from 'vitest';
import { liveOrders } from './fold/fold';
import { fewestTransfers, settleNets, split } from './rules/settle';
import { makeTestStore } from './testkit';

describe('settle extras (F-47)', () => {
  it('fewest transfers squares everyone in at most n − 1 moves', () => {
    const xs = fewestTransfers({ a: -500, b: -300, c: 600, d: 200, e: 0 });
    expect(xs.length).toBeLessThanOrEqual(3);
    const net: Record<string, number> = {};
    for (const x of xs) { net[x.from] = (net[x.from] ?? 0) - x.amount; net[x.to] = (net[x.to] ?? 0) + x.amount; }
    expect(net).toEqual({ a: -500, b: -300, c: 600, d: 200 });
  });
  it('exact split: amounts must add up to what is left; shares carry each partner balance', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().catalog.saveItem(null, { name: 'Thali', price: 10000, swatch: 0, category: 'Food', stationId: 'Kitchen', count: null });
    s().counter.newOrder(); s().counter.addItem(Object.keys(s().folded.items)[0] ?? '');
    s().counter.pay({ cash: 10000, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 10000, notes: {} });
    const [asha = '', steve = ''] = ['Asha', 'Steve'].map((n) => s().money.savePerson(null, n) ?? '');
    s().settle.setPartner(asha, true, 50); s().settle.setPartner(steve, true, 50);
    s().money.addEntry({ dir: 'spent', amount: 2000, label: 'Cups', kind: 'normal', parts: [{ source: 'person', personId: asha, amount: 2000 }], note: '', personId: null });
    s().settle.setSplitMode('exact'); s().settle.setExact(asha, 1000); s().settle.setExact(steve, 5000);
    const sp = () => split(s().folded, liveOrders(s().folded), s().folded.days[0]?.id ?? '');
    expect([sp().mode, sp().base, sp().exactLeft, sp().sharesOk]).toEqual(['exact', 8000, 2000, false]);
    expect(s().settle.lockDay()).toBe(false);
    s().settle.setExact(steve, 7000);
    expect(sp().partners.map((p) => p.share)).toEqual([3000, 7000]);
    expect(fewestTransfers(settleNets(sp()))).toEqual([{ from: 'stall', to: steve, amount: 7000 }, { from: 'stall', to: asha, amount: 3000 }]);
  });
});
