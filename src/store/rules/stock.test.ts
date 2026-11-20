// F-31 paste parser: the Q-STOCK-SET examples give ₹1,050; odd lines are flagged, never added.
import { describe, expect, it } from 'vitest';
import type { Item } from '../../contract';
import { parseLine, parsePaste, pasteTotal, usable } from './stock';

describe('stock paste parser (F-31)', () => {
  it('reads the locked examples in any label order', () => {
    const ls = parsePaste('Straw - 2 pcs - 100 - 20\nCoffee stick - 3 pkt - 300\n\nCups 60off 6pkt 450rs\nSugar - 4 pieces - 200 - 10%');
    expect(ls.map((l) => [l.name, l.qty, l.unit, l.paid, l.discount?.value ?? 0, l.discount?.kind ?? ''])).toEqual([
      ['Straw', 2, 'pcs', 10000, 20, 'amount'], ['Coffee stick', 3, 'pkt', 30000, 0, ''], ['Cups', 6, 'pkt', 45000, 60, 'amount'], ['Sugar', 4, 'pieces', 20000, 10, 'pct'],
    ]);
    expect(pasteTotal(ls, [])).toBe(105000);
    expect(parseLine('Milk ₹1,200 - 10 l').paid).toBe(120000);
  });
  it('flags unclear lines', () => {
    expect(parsePaste('just words\n5 - 100\nIce - 2 - 3 - 4 - 5\nTea 2 10off').map((l) => l.ok)).toEqual([false, false, false, false]);
  });
  // F-68 W-23: "Tea 20pcs" with no price is a count-only restock for a known item, never a new one, never a Spent amount.
  it('reads a line with no price as count only, for known items only', () => {
    const tea = { id: 't', name: 'Tea', removed: false } as Item;
    const l = parseLine('Tea 20pcs');
    expect([l.ok, l.priced, l.qty, l.unit, l.paid]).toEqual([true, false, 20, 'pcs', 0]);
    expect(usable(l, [tea])).toBe(true);
    expect(usable(l, [])).toBe(false);
    expect(usable(parseLine('tea - 2'), [tea])).toBe(true);
    expect(usable(parseLine('Tea 20pcs'), [{ ...tea, removed: true }])).toBe(false);
    expect(pasteTotal(parsePaste('Tea 20pcs\nCups 2 pkt 90'), [tea])).toBe(9000);
  });
});
