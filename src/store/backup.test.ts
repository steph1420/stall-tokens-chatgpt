// F-70 Data backup, snapshots, and reset unit tests (06 rule 5: tests with code).
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type Op } from '../contract';
import { CONFIG } from '../config';
import {
  backupFilename,
  createBackupData,
  createMemoryOpStore,
  createMemorySnapshotsStore,
  parseBackupJson,
} from '../data';
import { createAppStore } from './index';

function makeMockOp(seq: number, writer = 'test-writer', dayId = '2026-11-18'): Op {
  return {
    v: CONTRACT_VERSION,
    opId: `${writer}:${String(seq)}`,
    writer,
    seq,
    lamport: seq,
    vv: { [writer]: seq },
    wallAt: 1700000000000 + seq * 1000,
    kind: 'day.start',
    body: { dayId, label: 'Fair Day 1' },
  };
}

describe('backupFile adapter', () => {
  it('formats backup filename with IST date and short deviceId', () => {
    // 2026-11-18 12:00:00 UTC -> 2026-11-18 17:30:00 IST
    const date = new Date('2026-11-18T12:00:00Z');
    const fn = backupFilename('device-1234567890', date);
    expect(fn).toBe('stall-tokens-backup-2026-11-18-device-1.json');
  });

  it('creates and parses valid backup data', () => {
    const ops = [makeMockOp(1, 'w1'), makeMockOp(2, 'w1')];
    const backup = createBackupData(ops, 'device-abcdef', { theme: 'night', haptics: 'strong' });

    expect(backup.meta.contractVersion).toBe(CONTRACT_VERSION);
    expect(backup.meta.opCount).toBe(2);
    expect(backup.meta.deviceId).toBe('device-abcdef');
    expect(backup.meta.hash).toBeTruthy();

    const json = JSON.stringify(backup);
    const parsed = parseBackupJson(json);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.ops).toHaveLength(2);
    expect(parsed.data.meta.hash).toBe(backup.meta.hash);
    expect(parsed.data.prefs?.theme).toBe('night');
  });

  it('rejects invalid json or bad contract version', () => {
    expect(parseBackupJson('not a json').ok).toBe(false);

    const badVersion = {
      meta: { contractVersion: 999, hash: 'abc' },
      ops: [],
    };
    const res = parseBackupJson(JSON.stringify(badVersion));
    expect(res.ok).toBe(false);
  });

  it('rejects tampered or invalid ops', () => {
    const badOps = {
      meta: { contractVersion: CONTRACT_VERSION, hash: '' },
      ops: [{ invalid: 'not an op' }],
    };
    const res = parseBackupJson(JSON.stringify(badOps));
    expect(res.ok).toBe(false);
  });
});

describe('snapshots store', () => {
  it('saves, lists, and loads snapshots in retention order', async () => {
    const store = createMemorySnapshotsStore();
    const ops = [makeMockOp(1, 'w1')];

    const id1 = await store.save('First snapshot', ops);
    const id2 = await store.save('Second snapshot', ops);

    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(id2); // Newest first

    const loaded = await store.load(id1);
    expect(loaded?.reason).toBe('First snapshot');
    expect(loaded?.ops).toHaveLength(1);

    await store.delete(id1);
    const remaining = await store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(id2);
  });

  it('prunes snapshots when exceeding CONFIG.backup.keep', async () => {
    const store = createMemorySnapshotsStore();
    const ops = [makeMockOp(1, 'w1')];

    for (let i = 0; i < 25; i++) {
      await store.save(`Snapshot ${String(i)}`, ops);
    }

    const list = await store.list();
    expect(list).toHaveLength(CONFIG.backup.keep);
    expect(list[0]?.reason).toBe('Snapshot 24');
  });
});

describe('backupActions in AppStore', () => {
  it('performs export -> reset -> import round-trip restoring identical fold state', async () => {
    const memOps = createMemoryOpStore();
    const snapshots = createMemorySnapshotsStore();
    const devicePrefs = {
      deviceId: 'dev-roundtrip-1234',
      theme: 'night' as const,
      servingName: 'Counter-1',
      rangeIndex: 0,
      haptics: 'normal' as const,
      autoPrep: true,
      stationLook: 'full' as const,
      openLook: 'lines' as const,
      passcode: '',
      passcodeOff: true,
      syncUrl: '',
      syncKey: '',
      role: 'counter',
      orderId: '',
      page: 'menu' as const,
      lastRole: '',
      kitchenText: 'normal' as const,
      quiet: false,
      countNotesOpen: false,
      alertTone: 'chime' as const,
      nextOrderDelaySec: 2,
    };

    const ds = {
      ops: memOps,
      snapshots,
      device: { read: () => devicePrefs, write: () => {} },
      channel: { post: () => {}, subscribe: () => () => {} },
      transports: [],
    };

    const store = createAppStore(ds);
    await store.getState().start();

    // 1. Dispatch an item and verify fold state
    store.getState().catalog.saveItem('item-1', {
      name: 'Hot Tea',
      price: 1500,
      swatch: 0,
      category: 'Beverages',
      stationId: 'Beverages',
      count: 10,
    });
    const initialFold = store.getState().folded;
    expect(initialFold.items['item-1']?.name).toBe('Hot Tea');

    // 2. Export backup (assert sensitive secrets are stripped: SEC-02)
    const exported = store.getState().backup.exportData();
    expect(exported.json).toBeTruthy();
    const parsedJson = JSON.parse(exported.json) as { prefs?: Record<string, unknown> };
    expect(parsedJson.prefs?.syncKey).toBeUndefined();
    expect(parsedJson.prefs?.syncUrl).toBeUndefined();
    expect(parsedJson.prefs?.passcode).toBeUndefined();

    // 3. Reset database
    await store.getState().backup.resetAll(false);
    expect(Object.keys(store.getState().folded.items)).toHaveLength(0);

    // 4. Import backup (assert passcode is not overwritten: SEC-05)
    store.getState().setPrefs({ passcode: '1234' });
    const importPayload = JSON.stringify({ ...parsedJson, prefs: { ...parsedJson.prefs, passcode: '9999' } });
    const importRes = await store.getState().backup.importBackup(importPayload);
    expect(importRes.ok).toBe(true);
    expect(store.getState().prefs.passcode).toBe('1234');

    // 5. Verify restored state matches initial state
    const restoredFold = store.getState().folded;
    expect(restoredFold.items['item-1']?.name).toBe('Hot Tea');
    expect(restoredFold.items['item-1']?.price).toBe(1500);

    // 6. Idempotency: importing again produces no duplicate items or errors
    const secondImport = await store.getState().backup.importBackup(exported.json);
    expect(secondImport.ok).toBe(true);
    expect(store.getState().folded.items['item-1']?.name).toBe('Hot Tea');
  });

  it('snapshots can be created, listed, and restored into store', async () => {
    const memOps = createMemoryOpStore();
    const snapshots = createMemorySnapshotsStore();
    const ds = {
      ops: memOps,
      snapshots,
      device: {
        read: () => ({
          deviceId: 'dev-snap-1234',
          theme: 'night' as const,
          servingName: '',
          rangeIndex: 0,
          haptics: 'normal' as const,
          autoPrep: true,
          stationLook: 'full' as const,
          openLook: 'lines' as const,
          passcode: '',
          passcodeOff: true,
          syncUrl: '',
          syncKey: '',
          role: '',
          orderId: '',
          page: 'menu' as const,
          lastRole: '',
          kitchenText: 'normal' as const,
          quiet: false,
          countNotesOpen: false,
          alertTone: 'chime' as const,
          nextOrderDelaySec: 2,
        }),
        write: () => {},
      },
      channel: { post: () => {}, subscribe: () => () => {} },
      transports: [],
    };

    const store = createAppStore(ds);
    await store.getState().start();

    store.getState().catalog.saveItem('item-chai', {
      name: 'Special Chai',
      price: 2000,
      swatch: 1,
      category: 'Beverages',
      stationId: 'Beverages',
      count: 5,
    });
    const snapId = await store.getState().backup.createSnapshot('Before big change');
    expect(snapId).toBeTruthy();

    const snaps = await store.getState().backup.listSnapshots();
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps[0]?.reason).toBe('Before big change');

    // Reset items
    await store.getState().backup.resetAll(false);
    expect(store.getState().folded.items['item-chai']).toBeUndefined();

    // Restore snapshot
    const restoreRes = await store.getState().backup.restoreSnapshot(snapId);
    expect(restoreRes.ok).toBe(true);
    expect(store.getState().folded.items['item-chai']?.name).toBe('Special Chai');
  });
});
