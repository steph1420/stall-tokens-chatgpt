// P-3 A categories and PK-6 A stations (2.1.0 P1, plan §6): virtual seeds, rename keeps the id, two phones converge.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { compareOps, type Bodies, type Op, type OpKind, type VV } from '../../contract';
import { fold } from '../fold/fold';
import { activeStations, categories, categoryIdFor, itemCategoryId, stations } from './catalog';

/** Test-only: fail loudly instead of a non-null assertion. */
const must = <T,>(x: T | null | undefined): T => { if (x === null || x === undefined) throw new Error('missing'); return x; };

function op<K extends OpKind>(writer: string, seq: number, lamport: number, vv: VV, kind: K, body: Bodies[K]): Op {
  return { v: 2, opId: `${writer}:${String(seq)}`, writer, seq, lamport, vv, wallAt: 0, kind, body } as Op;
}
const item = (w: string, seq: number, id: string, category: string) => op(w, seq, seq, {}, 'item.set', { itemId: id, fields: { name: id, category } });
const cat = (w: string, seq: number, lamport: number, vv: VV, id: string, name: string, removed = false) =>
  op(w, seq, lamport, vv, 'record.set', { table: 'category', id, fields: { name }, removed });

describe('categories (P-3 A)', () => {
  it('legacy item text gives virtual categories with deterministic ids (case and spaces folded)', () => {
    const s = fold([item('a.1', 1, 'tea', 'Tea'), item('a.1', 2, 'cof', ' tea '), item('a.1', 3, 'sam', 'Snacks'), item('a.1', 4, 'x', '')]);
    const cs = categories(s.records.category, Object.values(s.items));
    expect(cs.map((c) => [c.id, c.name, c.virtual])).toEqual([['name:snacks', 'Snacks', true], ['name:tea', 'Tea', true]]);
    expect(itemCategoryId(must(s.items.cof))).toBe(categoryIdFor('Tea'));
    expect(itemCategoryId(must(s.items.x))).toBe('');
  });
  it('renaming a virtual category keeps its id, so old items still match', () => {
    const s = fold([item('a.1', 1, 'tea', 'Tea'), cat('a.1', 2, 2, { 'a.1': 1 }, 'name:tea', 'Hot drinks')]);
    const cs = categories(s.records.category, Object.values(s.items));
    expect(cs).toEqual([expect.objectContaining({ id: 'name:tea', name: 'Hot drinks', virtual: false })]);
    expect(itemCategoryId(must(s.items.tea))).toBe('name:tea');
  });
  it('two phones making the same edit offline converge on one category (no duplicates), clash recorded', () => {
    const x = cat('a.1', 1, 3, {}, 'name:tea', 'Chai');
    const y = cat('b.1', 1, 3, {}, 'name:tea', 'Chai');
    const s1 = fold([item('c.1', 1, 'tea', 'Tea'), x, y].sort(compareOps));
    const s2 = fold([y, item('c.1', 1, 'tea', 'Tea'), x].sort(compareOps));
    const c1 = categories(s1.records.category, Object.values(s1.items));
    expect(c1).toEqual(categories(s2.records.category, Object.values(s2.items)));
    expect(c1).toHaveLength(1);
    expect(s1.conflicts.length).toBeGreaterThan(0);
  });
  it('a removed category is hidden, including its virtual twin', () => {
    const s = fold([item('a.1', 1, 'tea', 'Tea'), cat('a.1', 2, 2, { 'a.1': 1 }, 'name:tea', 'Tea', true)]);
    expect(categories(s.records.category, Object.values(s.items))).toEqual([]);
  });
});

describe('stations (PK-6 A)', () => {
  it('CONFIG stations are virtual seeds, ids are their first names', () => {
    expect(stations(undefined).map((x) => x.id)).toEqual([...CONFIG.stations]);
  });
  it('rename keeps the id; removed = inactive; new stations sort after', () => {
    const s = fold([
      op('a.1', 1, 1, {}, 'record.set', { table: 'station', id: 'Momos', fields: { name: 'Dumplings', icon: '🥟' }, removed: false }),
      op('a.1', 2, 2, { 'a.1': 1 }, 'record.set', { table: 'station', id: 'Cutlets', fields: {}, removed: true }),
      op('a.1', 3, 3, { 'a.1': 2 }, 'record.set', { table: 'station', id: 'Grill', fields: { name: 'Grill' }, removed: false }),
    ]);
    const all = stations(s.records.station);
    expect(all.find((x) => x.id === 'Momos')).toMatchObject({ name: 'Dumplings', icon: '🥟', active: true, virtual: false });
    expect(all.find((x) => x.id === 'Cutlets')?.active).toBe(false);
    expect(all.at(-1)?.id).toBe('Grill');
    expect(activeStations(s.records.station).map((x) => x.id)).not.toContain('Cutlets');
  });
});
