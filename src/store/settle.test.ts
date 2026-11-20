// F-26..F-29 Settlement: repay others first, partners split the rest with their own balance added back (Q-NEXT-2 A);
// a partner covering someone gets it added back; a locked day refuses money changes until reopened.
import { describe, expect, it } from 'vitest';
import { liveOrders } from './fold/fold';
import { balances, split } from './rules/settle';
import { makeTestStore } from './testkit';

const reg = (amount: number) => [{ source: 'register' as const, personId: null, amount }];

describe('settlement (F-26 F-27 F-28 F-29)', () => {
  it('splits after repaying others, adds covering back, and locks the day', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().catalog.saveItem(null, { name: 'Thali', price: 10000, swatch: 0, category: 'Food', stationId: 'Kitchen', count: null });
    s().counter.newOrder(); s().counter.addItem(Object.keys(s().folded.items)[0] ?? '');
    s().counter.pay({ cash: 10000, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 10000, notes: {} });
    const [asha, steve, manoj] = ['Asha', 'Steve', 'Manoj'].map((n) => s().money.savePerson(null, n) ?? '');
    s().settle.setPartner(asha ?? '', true, 50); s().settle.setPartner(steve ?? '', true, 50);
    const by = (id: string, amount: number) => [{ source: 'person' as const, personId: id, amount }];
    s().money.addEntry({ dir: 'spent', amount: 4000, label: 'Ice', kind: 'normal', parts: by(manoj ?? '', 4000), note: '', personId: null });
    s().money.addEntry({ dir: 'spent', amount: 2000, label: 'Cups', kind: 'normal', parts: by(asha ?? '', 2000), note: '', personId: null });
    const sp = () => split(s().folded, liveOrders(s().folded), s().folded.days[0]?.id ?? '');
    expect([sp().inHand, sp().toSplit, ...sp().partners.map((p) => p.share)]).toEqual([10000, 6000, 4000, 2000]);
    expect(s().settle.pay(manoj ?? '', 5000, 'register')).toBe(false); // more than owed
    expect(s().settle.pay(manoj ?? '', 4000, 'person', steve ?? '')).toBe(true);
    expect(sp().others).toHaveLength(0);
    expect(sp().partners.map((p) => [p.share, p.covering.length])).toEqual([[4000, 0], [6000, 1]]);
    expect(s().settle.lockDay()).toBe(true);
    expect(s().money.addEntry({ dir: 'spent', amount: 100, label: 'X', kind: 'normal', parts: reg(100), note: '', personId: null })).toMatch(/locked/);
    s().settle.reopenDay();
    expect(s().money.addEntry({ dir: 'spent', amount: 100, label: 'X', kind: 'normal', parts: reg(100), note: '', personId: null })).toBeNull();
  });

  it('Mark cleared zeroes a balance without money moving, and Undo brings it back', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().counter.newOrder();
    const ravi = s().money.savePerson(null, 'Ravi') ?? '';
    s().money.addEntry({ dir: 'spent', amount: 3000, label: 'Gas', kind: 'normal', parts: [{ source: 'person', personId: ravi, amount: 3000 }], note: '', personId: null });
    expect(s().settle.clear(ravi, 'gifted', 'Thanks Ravi')).toBe(true);
    expect(balances(s().folded)[ravi]).toBe(0);
    s().settle.undo(s().folded.settlements[0]?.id ?? '');
    expect(balances(s().folded)[ravi]).toBe(3000);
  });
});
