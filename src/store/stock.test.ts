// F-30 / F-31 Paste stock adds counts (new things become supply items, never on the Menu) and one Spent entry (Q-PASTE-1 A).
import { describe, expect, it } from 'vitest';
import { parsePaste } from './rules/stock';
import { makeTestStore } from './testkit';

describe('stock (F-30 F-31)', () => {
  it('paste adds to stock and records one Spent entry; a refused entry adds nothing', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().catalog.saveItem(null, { name: 'Straw', price: 0, swatch: 0, category: 'Supplies', stationId: '', count: 10 });
    s().counter.newOrder();
    const lines = parsePaste('straw - 2 pcs - 100 - 20\nCups 60off 6pkt 450rs\nnonsense');
    const reg = [{ source: 'register' as const, personId: null, amount: 55000 }];
    expect(s().stock.paste(lines, [{ source: 'register', personId: null, amount: 100 }, { source: 'upi', personId: null, amount: 100 }], { cups: 'stock' })).toMatch(/add up/);
    expect(Object.values(s().folded.items)).toHaveLength(1);
    expect(s().stock.paste(lines, reg)).toBe('Choose Menu or Stock only for Cups');
    expect(s().stock.paste(lines, reg, { cups: 'stock' })).toBeNull();
    const items = Object.values(s().folded.items);
    expect(items.map((i) => [i.name, i.count, i.supply])).toEqual([['Straw', 12, false], ['Cups', 6, true]]);
    expect(s().folded.entries.map((e) => [e.dir, e.amount, e.label])).toEqual([['spent', 55000, 'Stock · 2 items']]);
    s().stock.step(items[1]?.id ?? '', -7);
    expect(s().folded.items[items[1]?.id ?? '']?.count).toBe(6);
  });
  it('a new thing marked Menu becomes a menu item (Q-SUPPLY-CONFIRM B)', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().counter.newOrder();
    expect(s().stock.paste(parsePaste('Brownie - 12 pcs - 600'), [{ source: 'register', personId: null, amount: 60000 }], { brownie: 'menu' })).toBeNull();
    expect(Object.values(s().folded.items).map((i) => [i.name, i.count, i.supply, i.category])).toEqual([['Brownie', 12, false, 'New']]);
  });
});
