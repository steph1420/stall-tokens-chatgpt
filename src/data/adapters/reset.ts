// F-70 Database and state reset (06 rule 1: data layer owns storage wipe).
import { CONFIG } from '../../config';
import { DB_NAME as LOG_DB } from './localIdb';
import { DB as RECEIPT_DB } from './receipts';
import { SNAPSHOTS_DB_NAME } from './snapshots';
import { PREFS_KEY, TAB_ROLE_KEY } from './deviceStore';

function deleteDb(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = factory.deleteDatabase(name);
      req.onsuccess = () => { resolve(); };
      req.onerror = () => { resolve(); };
      req.onblocked = () => { resolve(); };
    } catch (e) {
      console.warn('deleteDatabase caught error', e);
      resolve();
    }
  });
}

function clearLocalStorage(local: Storage | null, prefix: string): string {
  if (!local) return '';
  let preservedDeviceId = '';
  try {
    const raw = local.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.deviceId === 'string' && parsed.deviceId.length >= 8) {
        preservedDeviceId = parsed.deviceId;
      }
    }
  } catch (e) {
    console.warn('read deviceId caught error', e);
  }

  try {
    const toRemove: string[] = [];
    for (let i = 0; i < local.length; i++) {
      const k = local.key(i);
      if (k?.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) local.removeItem(k);
  } catch (e) {
    console.warn('clear keys caught error', e);
  }
  return preservedDeviceId;
}

async function clearSwCaches(prefix: string): Promise<void> {
  if (typeof globalThis === 'undefined' || !('caches' in globalThis)) return;
  try {
    const cacheNames = await globalThis.caches.keys();
    for (const name of cacheNames) {
      if (name.includes(prefix)) await globalThis.caches.delete(name);
    }
  } catch (e) {
    console.warn('clear caches caught error', e);
  }
}

export interface ResetOptions {
  deleteSnapshots?: boolean;
}

/** Complete wipe of local storage and indexedDB databases, preserving strictly the deviceId. */
export async function resetAllLocalData(
  factory: IDBFactory | null,
  local: Storage | null,
  session: Storage | null = null,
  options: ResetOptions = {},
): Promise<string> {
  const prefix = CONFIG.storage.prefix;
  const preservedId = clearLocalStorage(local, prefix);

  if (session) {
    try {
      session.removeItem(TAB_ROLE_KEY);
    } catch (e) {
      console.warn('session removeItem caught error', e);
    }
  }

  if (factory) {
    await deleteDb(factory, LOG_DB);
    await deleteDb(factory, RECEIPT_DB);
    if (options.deleteSnapshots !== false) {
      await deleteDb(factory, SNAPSHOTS_DB_NAME);
    }
  }

  await clearSwCaches(prefix);
  return preservedId;
}

/** Resets all persistent browser storage for the current data source. */
export async function resetBrowserData(deleteSnapshots = true): Promise<string> {
  const factory = typeof indexedDB !== 'undefined' ? indexedDB : null;
  const local = typeof localStorage !== 'undefined' ? localStorage : null;
  const session = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  return resetAllLocalData(factory, local, session, { deleteSnapshots });
}
