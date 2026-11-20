// Q-HARM-10 (LOCKED) replay tests (coding standards rule 4): clock skew ±1 day, offline concurrency, duplicates,
// gaps, old-app pushes, Sheet hand edits (sheet wins) and the Review flip. No ordering decision may read wallAt.
import { describe, expect, it } from 'vitest';
import { compareOps, isValidOp, type Bodies, type Op, type OpKind, type VV } from '../../contract';
import { createFakeHub, createFakeTransport, createSyncEngine } from '../../data';
import { fold } from './fold';

const DAY = 86_400_000;
const T0 = 1_794_800_000_000;
function op<K extends OpKind>(writer: string, seq: number, lamport: number, vv: VV, kind: K, body: Bodies[K], wallAt = T0): Op {
  return { v: 2, opId: `${writer}:${String(seq)}`, writer, seq, lamport, vv, wallAt, kind, body } as Op;
}
const price = (w: string, seq: number, lamport: number, vv: VV, p: number, wallAt = T0) => op(w, seq, lamport, vv, 'item.set', { itemId: 'tea', fields: { price: p } }, wallAt);
const src = (w: string, seq: number, lamport: number, vv: VV, name: string) => op(w, seq, lamport, vv, 'record.set', { table: 'source', id: 's1', fields: { name, type: 'Market' }, removed: false });
const state = (ops: Op[]) => fold([...ops].sort(compareOps));

describe('Q-HARM-10 sync rules', () => {
  it('clock skew ±1 day never decides: the op that saw the other wins', () => {
    const ahead = price('aaaa.1', 1, 1, {}, 1000, T0 + DAY);
    const behind = price('bbbb.1', 1, 2, { 'aaaa.1': 1 }, 2000, T0 - DAY);
    expect(state([ahead, behind]).items.tea?.price).toBe(2000);
    expect(state([behind, ahead]).conflicts).toHaveLength(0);
  });
  it('offline concurrency: same result in any arrival order, and the clash is recorded', () => {
    const a = price('aaaa.1', 1, 5, {}, 1000); const b = price('bbbb.1', 1, 5, {}, 3000);
    const x = state([a, b]); const y = state([b, a]);
    expect(x.items.tea?.price).toBe(y.items.tea?.price);
    expect(x.conflicts).toEqual([expect.objectContaining({ target: 'item:tea', field: 'price', rule: 'causal' })]);
  });
  it('duplicates are ignored and an old-contract op is refused', () => {
    const a = price('aaaa.1', 1, 1, {}, 1000);
    expect(state([a, a, a]).items.tea?.price).toBe(1000);
    expect(isValidOp({ ...a, v: 1 })).toBe(false);
  });
  it('sheet wins against a concurrent phone (even an old app with an empty vv); a phone that saw it may change it', () => {
    const sheet = src('sheet', 1, 10, { 'aaaa.1': 1 }, 'Crawford Market');
    const oldApp = src('cccc.1', 1, 50, {}, 'Old name');
    const s1 = state([src('aaaa.1', 1, 1, {}, 'First'), sheet, oldApp]);
    expect(s1.records.source?.s1?.fields.name).toBe('Crawford Market');
    expect(s1.conflicts.at(-1)).toEqual(expect.objectContaining({ winner: 'sheet:1', loser: 'cccc.1:1', rule: 'sheet-wins' }));
    const after = src('cccc.1', 2, 51, { sheet: 1, 'cccc.1': 1 }, 'Crawford (Gate 2)');
    expect(state([sheet, oldApp, after]).records.source?.s1?.fields.name).toBe('Crawford (Gate 2)');
  });
  it('a gap in seq makes the bridge ask for a resend, and the engine resends from the local log', async () => {
    const hub = createFakeHub();
    const mine = [price('aaaa.1', 1, 1, {}, 1000), price('aaaa.1', 2, 2, { 'aaaa.1': 1 }, 1100)];
    const e = createSyncEngine([createFakeTransport(hub)], () => false, () => 1, (w, from) => mine.filter((o) => o.writer === w && o.seq >= from));
    e.enqueue([mine[1] as Op]); // seq 1 was never sent (lost)
    await e.round();
    expect(e.status().pending).toBe(1);
    await e.round();
    expect(hub.log.map((o) => o.opId).sort()).toEqual(['aaaa.1:1', 'aaaa.1:2']);
  });
});
