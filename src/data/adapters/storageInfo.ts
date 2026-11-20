// F-70 Storage info & persistent storage adapter (06 rule 4: browser globals behind an adapter).
import { CONFIG } from '../../config';

export interface StorageEstimate {
  readonly usageBytes: number;
  readonly quotaBytes: number;
  readonly warning: boolean;
  readonly persisted: boolean;
}

export interface StorageInfoStore {
  estimate(): Promise<StorageEstimate>;
  persist(): Promise<boolean>;
}

function getStorageManager(): StorageManager | null {
  const nav = globalThis.navigator as unknown as { storage?: StorageManager } | undefined;
  return nav?.storage ?? null;
}

export function createBrowserStorageInfo(): StorageInfoStore {
  return {
    async estimate(): Promise<StorageEstimate> {
      const storage = getStorageManager();
      if (!storage) {
        return { usageBytes: 0, quotaBytes: 0, warning: false, persisted: false };
      }
      try {
        const est = await storage.estimate();
        const persisted = await storage.persisted();
        const usageBytes = est.usage ?? 0;
        const quotaBytes = est.quota ?? 0;
        const ratio = quotaBytes > 0 ? usageBytes / quotaBytes : 0;
        const warning = ratio >= CONFIG.storage.warningRatio;
        return { usageBytes, quotaBytes, warning, persisted };
      } catch (err) {
        console.warn('Storage estimate failed:', err);
        return { usageBytes: 0, quotaBytes: 0, warning: false, persisted: false };
      }
    },

    async persist(): Promise<boolean> {
      const storage = getStorageManager();
      if (!storage) {
        return false;
      }
      try {
        return await storage.persist();
      } catch (err) {
        console.warn('Storage persist request failed:', err);
        return false;
      }
    },
  };
}

export function createMemoryStorageInfo(initial?: Partial<StorageEstimate>): StorageInfoStore {
  let persisted = initial?.persisted ?? false;
  return {
    estimate: () =>
      Promise.resolve({
        usageBytes: initial?.usageBytes ?? 1024 * 64,
        quotaBytes: initial?.quotaBytes ?? 1024 * 1024 * 100,
        warning: initial?.warning ?? false,
        persisted,
      }),
    persist: () => {
      persisted = true;
      return Promise.resolve(true);
    },
  };
}
