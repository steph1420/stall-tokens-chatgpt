// F-03 IndexedDB op store. DB name carries the storage prefix (shared github.io origin, ARCHITECTURE §9).
import { isValidOp, type Op } from '../../contract';
import { CONFIG } from '../../config';
import type { OpStore } from '../types';

const STORE = 'ops';
export const DB_NAME = `${CONFIG.storage.prefix}.log`;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => { resolve(r.result); };
    r.onerror = () => { reject(r.error ?? new Error('IndexedDB request failed')); };
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const r = factory.open(DB_NAME, CONFIG.storage.dbVersion);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'opId' }); };
  return request(r);
}

export function createLocalIdb(factory: IDBFactory): OpStore {
  let db: Promise<IDBDatabase> | null = null;
  const conn = () => (db ??= open(factory));
  return {
    async load() {
      const d = await conn();
      const rows: unknown[] = await request(d.transaction(STORE, 'readonly').objectStore(STORE).getAll());
      return rows.filter(isValidOp);
    },
    async append(ops: readonly Op[]) {
      if (ops.length === 0) return;
      const d = await conn();
      await new Promise<void>((resolve, reject) => {
        const tx = d.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        for (const op of ops) os.put(op); // put by opId: a duplicate overwrites itself with identical data
        tx.oncomplete = () => { resolve(); };
        tx.onerror = () => { reject(tx.error ?? new Error('IndexedDB write failed')); };
        tx.onabort = () => { reject(tx.error ?? new Error('IndexedDB write aborted')); };
      });
    },
  };
}
