// F-35 Sheet bridge client against a fake web app that speaks the same protocol as apps-script/Code.gs.
import { describe, expect, it } from 'vitest';
import type { Op } from '../contract';
import { createSheetTransport } from './adapters/sheetTransport';

function fakeWebApp(key: string) {
  const rows: Op[] = [];
  let down = false;
  const fetchFn = (_url: string, init: { body: string }) => {
    if (down) return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') });
    const b = JSON.parse(init.body) as { action: string; key: string; ops?: Op[]; cursor?: string };
    const reply = (x: unknown) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(x)) });
    if (b.key !== key) return reply({ ok: false, error: 'wrong stall key' });
    if (b.action === 'push') { for (const o of b.ops ?? []) if (!rows.some((r) => r.opId === o.opId)) rows.push(o); return reply({ ok: true, stored: (b.ops ?? []).map((o) => o.opId) }); }
    const from = Number(b.cursor) || 0;
    return reply({ ok: true, ops: rows.slice(from), cursor: String(rows.length) });
  };
  return { fetchFn, rows, setDown: (v: boolean) => { down = v; } };
}
const op = (n: number): Op => ({ v: 2, opId: `devA.1:${String(n)}`, writer: 'devA.1', seq: n, lamport: n, vv: {}, wallAt: 1, kind: 'setting.set', body: { key: 'stallName', value: `S${String(n)}` } });

describe('sheet transport (F-35)', () => {
  it('pushes once per op id and pulls after the cursor', async () => {
    const app = fakeWebApp('mango');
    const t = createSheetTransport({ url: 'https://script.example/exec', key: 'mango' }, app.fetchFn);
    expect((await t.push([op(1), op(2)])).stored).toEqual(['devA.1:1', 'devA.1:2']);
    await t.push([op(2), op(3)]);
    expect(app.rows).toHaveLength(3);
    const first = await t.pull('0');
    expect([first.ops.length, first.cursor]).toEqual([3, '3']);
    expect((await t.pull(first.cursor)).ops).toHaveLength(0);
  });
  it('surfaces a wrong key or a down bridge as an error', async () => {
    const app = fakeWebApp('mango');
    await expect(createSheetTransport({ url: 'https://x/exec', key: 'nope' }, app.fetchFn).pull('0')).rejects.toThrow(/wrong stall key/);
    app.setDown(true);
    await expect(createSheetTransport({ url: 'https://x/exec', key: 'mango' }, app.fetchFn).push([op(1)])).rejects.toThrow(/503/);
  });
});
