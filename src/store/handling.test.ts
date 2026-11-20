// s127 take-over (Q-TAKE-1a, Q-TAKE-2a, Q-HARM-10; D-TAKE-1..8): lease rules, fold, presence and the watcher flows,
// with two fake phones on one in-memory bridge (local test data only).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { Order } from '../contract';
import { createFakeHub, createFakeTransport, createSyncEngine } from '../data';
import { DEMO_MENU } from '../mock/fixtures';
import { backStep } from './nav';
import { holding, phoneLabel } from './rules/handling';
import { makeTestStore } from './testkit';

const T0 = Date.UTC(2026, 10, 16, 10, 0);
type T = ReturnType<typeof makeTestStore>;
const onCounter = (t: T) => { t.store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } })); };
const order = (h: Order['handler']): Order => ({ handler: h, deleted: false, cancel: null, complete: null, lines: [{ lineId: 'l1', itemId: 'i1', name: 'Tea', price: 1000, qty: 1, committed: 0, status: 'draft', note: '', category: '', stationId: null }], payments: [], refunds: [], sent: false } as unknown as Order);

describe('holding (pure lease rules)', () => {
  const h = { deviceId: 'otherdev-id', label: 'Counter 2', at: 0, takeover: false };
  it('free with no claim, mine for my claim, free without sync (same-phone tabs only)', () => {
    expect(holding(order(null), 'me000000', { heard: {}, since: 0 }, T0).kind).toBe('free');
    expect(holding(order({ ...h, deviceId: 'me000000-x' }), 'me000000-y', { heard: {}, since: 0 }, T0).kind).toBe('mine');
    expect(holding(order(h), 'me000000', { heard: {}, since: null }, T0).kind).toBe('free');
  });
  it('busy while heard within 90 s (D-TAKE-1), free after; a fresh start waits one lease', () => {
    const lease = CONFIG.handling.leaseMs;
    expect(lease).toBe(90_000);
    expect(holding(order(h), 'me000000', { heard: { otherdev: T0 }, since: T0 - 1e6 }, T0 + lease).kind).toBe('busy');
    expect(holding(order(h), 'me000000', { heard: { otherdev: T0 }, since: T0 - 1e6 }, T0 + lease + 1).kind).toBe('free');
    expect(holding(order(h), 'me000000', { heard: {}, since: T0 }, T0 + 1000).kind).toBe('busy');
    expect(holding(order(h), 'me000000', { heard: {}, since: T0 }, T0 + lease + 1).kind).toBe('free');
  });
  it('phone label: "Counter N" plus the serving name', () => {
    expect(phoneLabel(1, ' Ravi ')).toBe('Counter 2 · Ravi');
    expect(phoneLabel(0, '')).toBe('Counter 1');
  });
});

describe('presence beats (Q-TAKE-ALIVE A)', () => {
  it('the engine keeps "last heard from" per phone; a bridge without presence falls back to ops', async () => {
    let now = T0;
    const hub = createFakeHub(() => now);
    const a = createSyncEngine([createFakeTransport(hub)], () => false, () => now);
    const b = createSyncEngine([createFakeTransport(hub)], () => false, () => now);
    await a.round({ deviceId: 'aaaaaaaa-1', label: 'Counter 1', orderId: 'o1' });
    now += 5000;
    await b.round({ deviceId: 'bbbbbbbb-1', label: 'Counter 2', orderId: '' });
    const seenA = b.presence().find((p) => p.deviceId === 'aaaaaaaa-1');
    expect(seenA?.heardAt).toBe(T0);
    expect(seenA?.orderId).toBe('o1');
    expect(b.hasPresence()).toBe(true);
    const hub2 = createFakeHub(() => now);
    hub2.presence = false;
    const c = createSyncEngine([createFakeTransport(hub2)], () => false, () => now);
    await c.round({ deviceId: 'cccccccc-1', label: 'Counter 3', orderId: '' });
    expect(c.hasPresence()).toBe(false);
    expect(c.presence()).toEqual([]);
  });
});

async function twoPhones() {
  let now = T0;
  const clock = () => now;
  const hub = createFakeHub(clock);
  const A = makeTestStore({ hub, device: 'aaaaaaaa', now: clock });
  const B = makeTestStore({ hub, device: 'bbbbbbbb', now: clock, idPrefix: 'bbbbbbbb' });
  await A.store.getState().start(); await B.store.getState().start();
  A.store.getState().setPrefs({ rangeIndex: 0 }); B.store.getState().setPrefs({ rangeIndex: 1 });
  onCounter(A); onCounter(B);
  const a = () => A.store.getState(); const b = () => B.store.getState();
  for (const m of DEMO_MENU) a().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: m.count });
  const sync = async () => { await a().syncNow(); await b().syncNow(); await a().syncNow(); };
  await sync();
  const item = Object.values(b().folded.items).find((i) => i.name === DEMO_MENU[0].name)?.id ?? '';
  return { a, b, sync, item, tick: (ms: number) => { now += ms; } };
}

describe('two phones, one order (s127)', () => {
  it('the phone on an order claims it; the other waits; editing is refused; Take over moves it (s127a/b)', async () => {
    const { a, b, sync, item } = await twoPhones();
    a().counter.addItem(item);
    const id = a().ui.orderId ?? '';
    expect(a().folded.orders[id]?.handler?.label).toBe('Counter 1');
    await sync();
    b().handling.open(id);
    expect(b().handling.of(id).kind).toBe('busy');
    expect(b().ui.waitFor).toBe(id);
    expect(b().ui.waitLabel).toBe('Counter 1');
    b().counter.addItem(item);
    expect(b().folded.orders[id]?.lines[0]?.qty).toBe(1); // refused while Counter 1 has it
    expect(b().ui.toast?.text).toMatch(/Take over/);
    b().handling.takeOver(id);
    expect(b().ui.waitFor).toBeNull();
    expect(b().ui.toast?.text).toBe('#001 is yours now');
    b().counter.addItem(item);
    expect(b().folded.orders[id]?.lines[0]?.qty).toBe(2);
    await sync();
    expect(a().handling.displaced(id)).toBe(true); // s127b view-only, own Take over
    a().counter.addItem(item);
    expect(a().folded.orders[id]?.lines[0]?.qty).toBe(2);
  });
  it('a release comes in at once: the waiting phone gets the order with its items (Q-TAKE-1a)', async () => {
    const { a, b, sync, item } = await twoPhones();
    a().counter.addItem(item); a().counter.addItem(item);
    const id = a().ui.orderId ?? '';
    await sync();
    b().handling.open(id);
    expect(b().ui.waitFor).toBe(id);
    a().back(); // Back from the menu leaves the Counter: the release goes out at once
    expect(a().ui.screen).toBe('launch');
    await sync();
    expect(b().ui.waitFor).toBeNull();
    expect(b().handling.of(id).kind).toBe('mine');
    expect(b().ui.toast?.text).toBe('Counter 1 is done · #001 is yours now');
    expect(b().folded.orders[id]?.lines[0]?.qty).toBe(2);
  });
  it('a silent phone loses the order after the lease (D-TAKE-1, Q-TAKE-OFFLINE A)', async () => {
    const { a, b, sync, item, tick } = await twoPhones();
    a().counter.addItem(item);
    const id = a().ui.orderId ?? '';
    await sync();
    b().handling.open(id);
    tick(CONFIG.handling.leaseMs - 1000);
    await b().syncNow();
    expect(b().ui.waitFor).toBe(id);
    tick(2000);
    b().handling.checkNow(); await b().syncNow();
    expect(b().ui.waitFor).toBeNull();
    expect(b().ui.toast?.text).toBe('Counter 1 has gone quiet · #001 is yours now');
  });
  it('freed while this phone is on another order: a calm toast with Open, never opened by itself (D-TAKE-7)', async () => {
    const { a, b, sync, item } = await twoPhones();
    a().counter.addItem(item);
    const id = a().ui.orderId ?? '';
    await sync();
    b().handling.open(id);
    b().handling.leave();
    b().counter.newOrder(); // s127a "New order": a fresh token for the next customer
    const mine = b().ui.orderId;
    expect(mine).not.toBe(id);
    // B did not wait any more (Back / New order). Now make B wait, then switch it to its own order.
    b().handling.open(id);
    expect(b().ui.waitFor).toBe(id);
    b().counter.selectOrder(mine ?? '');
    a().back();
    await sync();
    expect(b().ui.orderId).toBe(mine);
    expect(b().ui.toast?.text).toBe('#001 is free now');
    expect(b().ui.toast?.action?.run).toBe('open');
    b().handling.open(id); // the toast's Open
    expect(b().ui.orderId).toBe(id);
    expect(b().handling.of(id).kind).toBe('mine');
  });
  it('cancel sends the release at once (Q-TAKE-1a broadcast)', async () => {
    const { a, b, sync, item } = await twoPhones();
    a().counter.addItem(item);
    const id = a().ui.orderId ?? '';
    a().counter.cancelOrder(id, '');
    await sync();
    expect(b().folded.orders[id]?.handler).toBeNull();
  });
});

describe('Back (W-13, nav.backStep)', () => {
  it('sheet first, then waiting, then the order view, tab, pages, launch', () => {
    const t = makeTestStore();
    const base = t.store.getState();
    const u = { ...base.ui, screen: 'counter' as const, counterTab: 'new' as const, orderId: 'o1', pages: { o1: 'payment' as const } };
    expect(backStep({ ...base, ui: { ...u, sheet: { kind: 'drafts' } } })).toEqual({ sheet: null });
    expect(backStep({ ...base, ui: { ...u, waitFor: 'o1' } })).toEqual({ orderId: null, waitFor: null, waitLabel: '' });
    expect(backStep({ ...base, ui: { ...u, orderView: 'o2' } })).toEqual({ orderView: null });
    expect(backStep({ ...base, ui: { ...u, counterTab: 'unpaid' } })).toEqual({ counterTab: 'new' });
    expect(backStep({ ...base, ui: u })).toEqual({ pages: { o1: 'billing' } });
    expect(backStep({ ...base, ui: { ...u, pages: { o1: 'menu' } } })).toEqual({ screen: 'launch' });
    expect(backStep({ ...base, ui: { ...u, screen: 'launch' } })).toBeNull();
  });
});
