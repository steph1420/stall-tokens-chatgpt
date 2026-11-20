import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { opMaker } from '../mock/fixtures';
import { createDeviceStore, PREFS_KEY, TAB_ROLE_KEY } from './adapters/deviceStore';
import { createFakeHub, createFakeTransport } from './adapters/fakeTransport';
import { createFallbackOpStore } from './adapters/fallback';
import { createLocalIdb, DB_NAME } from './adapters/localIdb';
import { DB as RECEIPTS_DB } from './adapters/receipts';
import { createSyncStateStore } from './adapters/syncState';
import { createSyncEngine } from './sync/engine';

describe('LocalIdb (F-03)', () => {
  it('stores ops once, survives reopen, and drops corrupt rows', async () => {
    const mk = opMaker('idb.1');
    const a = mk('day.start', { dayId: 'd', label: '' });
    const b = mk('order.create', { orderId: 'o', dayId: 'd', token: 1, servedBy: '' });
    const s1 = createLocalIdb(indexedDB);
    await s1.append([a, b, a]);
    await s1.append([b]);
    await s1.append([{ ...b, opId: 'junk', seq: 99 }]);
    const again = await createLocalIdb(indexedDB).load();
    expect(again.map((o) => o.opId).sort()).toEqual(['idb.1:1', 'idb.1:2']);
  });
  it('names start with the storage prefix (shared github.io origin)', () => {
    // F-49: the prefix is per channel (Stable `stall-tokens.v2`, Beta `stall-tokens-beta.v2`).
    expect(DB_NAME).toBe(`${CONFIG.storage.prefix}.log`);
    expect(PREFS_KEY.startsWith(CONFIG.storage.prefix)).toBe(true);
    expect(RECEIPTS_DB).toBe(`${CONFIG.storage.prefix}.receipts`);
  });
});

describe('device prefs', () => {
  it('fall back to defaults on corrupt or hostile data', () => {
    localStorage.setItem(PREFS_KEY, '{"theme":"neon","rangeIndex":9,"deviceId":"x"}');
    const p = createDeviceStore(localStorage, () => 'abcdef0123456789').read();
    expect(p).toMatchObject({ theme: 'night', rangeIndex: 0, deviceId: 'abcdef0123456789' });
    localStorage.setItem(PREFS_KEY, 'not json');
    expect(createDeviceStore(localStorage, () => 'zzzzzzzz1').read().deviceId).toBe('zzzzzzzz1');
  });
  it('work with no storage at all (private mode)', () => {
    const d = createDeviceStore(null, () => 'private01');
    d.write({ ...d.read(), theme: 'day' });
    expect(d.read().theme).toBe('day');
  });
  it('a reload keeps this tab\'s own place when another tab on the device became the Kitchen (PK-5)', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ lastRole: 'kitchen' }));
    sessionStorage.setItem(TAB_ROLE_KEY, '');
    expect(createDeviceStore(localStorage, () => 'tab1', sessionStorage).read().lastRole).toBe('');
    expect(createDeviceStore(localStorage, () => 'tab1', sessionStorage).read().lastRole).toBe(''); // and again on the next reload
    expect(sessionStorage.getItem(TAB_ROLE_KEY)).toBe('');
    sessionStorage.clear(); // app killed and reopened: the device's last place
    expect(createDeviceStore(localStorage, () => 'tab2', sessionStorage).read().lastRole).toBe('kitchen');
    sessionStorage.setItem(TAB_ROLE_KEY, 'admin'); // hostile tab value is ignored
    expect(createDeviceStore(localStorage, () => 'tab3', sessionStorage).read().lastRole).toBe('kitchen');
  });
});

describe('sync engine with the fake transport (F-03)', () => {
  it('pushes, pulls, survives errors, offline and duplicate pulls, and backs off', async () => {
    const hub = createFakeHub();
    const seenA = new Set<string>();
    const a = createSyncEngine([createFakeTransport(hub)], (id) => seenA.has(id), () => 1);
    const b = createSyncEngine([createFakeTransport(hub)], () => false, () => 1);
    const mk = opMaker('devA.1');
    const op1 = mk('day.start', { dayId: 'd', label: '' });
    seenA.add(op1.opId);
    a.enqueue([op1]);
    hub.offline = true;
    expect(await a.round()).toEqual([]);
    expect(a.status()).toMatchObject({ pending: 1, online: false });
    expect(a.status().error).toContain('offline');
    expect(a.nextDelayMs()).toBeGreaterThan(4000);
    hub.offline = false;
    hub.failNext = 1;
    await a.round();
    expect(a.status().pending).toBe(1);
    await a.round();
    expect(a.status()).toMatchObject({ pending: 0, online: true, error: null });
    hub.duplicatePulls = true;
    const got = await b.round();
    expect(got.map((o) => o.opId)).toEqual(['devA.1:1']);
    expect(a.nextDelayMs()).toBe(4000);
  });

  it('rehydrates outbox across reloads and persists pull cursor (SYNC-P0-01, SYNC-P1-01)', async () => {
    const hub = createFakeHub();
    const syncState = createSyncStateStore(localStorage);
    const mk = opMaker('devA.1');
    const op1 = mk('day.start', { dayId: 'd', label: '' });
    const op2 = mk('order.create', { orderId: 'o1', dayId: 'd', token: 1, servedBy: '' });

    // Session 1: create ops while offline, then reload
    const eng1 = createSyncEngine([createFakeTransport(hub)], () => false, () => 1, () => [], syncState);
    eng1.enqueue([op1, op2]);
    expect(eng1.status().pending).toBe(2);

    // Simulate restart/reload: new engine instance with rehydrate
    const eng2 = createSyncEngine([createFakeTransport(hub)], () => false, () => 1, () => [], syncState);
    // Before rehydrate, outbox has 0 in-memory
    expect(eng2.status().pending).toBe(0);
    // Rehydrate from loaded ops
    eng2.rehydrate([op1, op2], 'devA');
    expect(eng2.status().pending).toBe(2);

    // Now transport comes online and syncs
    await eng2.round();
    expect(eng2.status().pending).toBe(0);
    expect(hub.log.map((o) => o.opId)).toEqual([op1.opId, op2.opId]);

    // Pull cursor is saved in syncState
    expect(syncState.read('fake').cursor).toBeTruthy();
  });
});

describe('IndexedDB fallback (F-03)', () => {
  it('works in memory and says so when the saved log cannot open', async () => {
    const broken = { load: () => Promise.reject(new Error('blocked')), append: () => Promise.resolve() };
    const s = createFallbackOpStore(broken);
    expect(s.persistent?.()).toBe(true);
    expect(await s.load()).toEqual([]);
    expect(s.persistent?.()).toBe(false);
    expect(createFallbackOpStore(null).persistent?.()).toBe(false);
  });
});
