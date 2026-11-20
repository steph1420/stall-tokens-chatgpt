// F-70 Snapshots store in IndexedDB (<prefix>.snapshots). Keeps up to CONFIG.backup.keep (20).
import { CONFIG } from '../../config';
import type { Op } from '../../contract';
import type { DevicePrefs, SnapshotRecord, SnapshotSummary, SnapshotsStore } from '../types';
import { computeOpLogHash } from './backupFile';

const STORE = 'snapshots';
export const SNAPSHOTS_DB_NAME = `${CONFIG.storage.prefix}.snapshots`;
let snapshotSeq = 0;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => { resolve(r.result); };
    r.onerror = () => { reject(r.error ?? new Error('Snapshots IndexedDB request failed')); };
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  const r = factory.open(SNAPSHOTS_DB_NAME, 1);
  r.onupgradeneeded = () => {
    if (!r.result.objectStoreNames.contains(STORE)) {
      r.result.createObjectStore(STORE, { keyPath: 'id' });
    }
  };
  return request(r);
}

async function pruneOldSnapshots(store: SnapshotsStore): Promise<void> {
  try {
    const all = await store.list();
    const maxKeep = CONFIG.backup.keep;
    if (all.length > maxKeep) {
      for (const s of all.slice(maxKeep)) {
        await store.delete(s.id);
      }
    }
  } catch (e) {
    console.warn('pruneOldSnapshots caught error', e);
  }
}

function writeSnapshotRow(d: IDBDatabase, record: SnapshotRecord): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error ?? new Error('Failed to save snapshot')); };
  });
}

function deleteSnapshotRow(d: IDBDatabase, id: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error ?? new Error('Failed to delete snapshot')); };
  });
}

export function createIdbSnapshotsStore(factory: IDBFactory): SnapshotsStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const conn = () => (dbPromise ??= openDb(factory));

  const store: SnapshotsStore = {
    async save(reason: string, ops: readonly Op[], prefs?: Partial<DevicePrefs>): Promise<string> {
      const d = await conn();
      const createdAt = Date.now() * 1000 + (++snapshotSeq % 1000);
      const id = `snapshot-${String(createdAt)}-${Math.random().toString(36).slice(2, 7)}`;
      const hash = computeOpLogHash(ops);
      await writeSnapshotRow(d, { id, createdAt, reason, opCount: ops.length, hash, ops, prefs });
      await pruneOldSnapshots(store);
      return id;
    },

    async list(): Promise<readonly SnapshotSummary[]> {
      const d = await conn();
      const rows: unknown[] = await request(d.transaction(STORE, 'readonly').objectStore(STORE).getAll());
      const records = (Array.isArray(rows) ? rows : []) as SnapshotRecord[];
      records.sort((a, b) => b.createdAt - a.createdAt);
      return records.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        reason: r.reason,
        opCount: r.opCount,
        hash: r.hash,
      }));
    },

    async load(id: string): Promise<SnapshotRecord | null> {
      const d = await conn();
      const record: unknown = await request(d.transaction(STORE, 'readonly').objectStore(STORE).get(id));
      return (record && typeof record === 'object') ? (record as SnapshotRecord) : null;
    },

    async delete(id: string): Promise<void> {
      const d = await conn();
      await deleteSnapshotRow(d, id);
    },
  };
  return store;
}

/** In-memory snapshots store for Vitest and environments without IndexedDB. */
export function createMemorySnapshotsStore(): SnapshotsStore {
  const map = new Map<string, SnapshotRecord>();

  return {
    save(reason: string, ops: readonly Op[], prefs?: Partial<DevicePrefs>): Promise<string> {
      const createdAt = Date.now() * 1000 + (++snapshotSeq % 1000);
      const id = `snapshot-${String(createdAt)}-${Math.random().toString(36).slice(2, 7)}`;
      const hash = computeOpLogHash(ops);
      map.set(id, { id, createdAt, reason, opCount: ops.length, hash, ops, prefs });

      if (map.size > CONFIG.backup.keep) {
        const sorted = [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
        for (const s of sorted.slice(CONFIG.backup.keep)) map.delete(s.id);
      }
      return Promise.resolve(id);
    },

    list(): Promise<readonly SnapshotSummary[]> {
      const sorted = [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
      return Promise.resolve(sorted.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        reason: r.reason,
        opCount: r.opCount,
        hash: r.hash,
      })));
    },

    load(id: string): Promise<SnapshotRecord | null> {
      return Promise.resolve(map.get(id) ?? null);
    },

    delete(id: string): Promise<void> {
      map.delete(id);
      return Promise.resolve();
    },
  };
}
