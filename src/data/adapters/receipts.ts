// F-47 Receipt photos (Q-SETTLE-EXTRAS C): kept on this phone only, in their own IndexedDB store keyed by entry id.
// Not synced and not in the Sheet (photos are large; the op log stays small). Losing the phone loses the photos.
import { CONFIG } from '../../config';

// F-49: the channel's storage prefix, so Beta's photos never mix with Stable's on the same origin.
export const DB = `${CONFIG.storage.prefix}.receipts`;
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('No storage for photos on this browser')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => { res(r.result); };
    r.onerror = () => { rej(r.error ?? new Error('Photo storage failed')); };
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => { const q = run(db.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => { res(q.result); }; q.onerror = () => { rej(q.error ?? new Error('Photo storage failed')); }; });
  } finally { db.close(); }
}

export const putReceipt = (entryId: string, photo: Blob): Promise<IDBValidKey> => tx('readwrite', (s) => s.put(photo, entryId));
export const getReceipt = (entryId: string): Promise<Blob | undefined> => tx('readonly', (s) => s.get(entryId) as IDBRequest<Blob | undefined>);
export const receiptIds = async (): Promise<string[]> => (await tx('readonly', (s) => s.getAllKeys())).map(String);
export const dropReceipt = (entryId: string): Promise<undefined> => tx('readwrite', (s) => s.delete(entryId));
