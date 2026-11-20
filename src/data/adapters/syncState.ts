// Persistent sync cursor and pending outbox tracking per transport (ARCHITECTURE §4.3, SYNC-P0-01, SYNC-P1-01).
import { CONFIG } from '../../config';

export interface TransportSyncState {
  readonly cursor: string;
  readonly outbox: readonly string[];
}

export interface SyncStateStore {
  read(transportName: string): TransportSyncState;
  writeCursor(transportName: string, cursor: string): void;
  writeOutbox(transportName: string, outboxOpIds: readonly string[]): void;
}

export function createSyncStateStore(storage: Storage | null): SyncStateStore {
  const key = (name: string) => `${CONFIG.storage.prefix}.sync.${name}`;
  return {
    read(name) {
      try {
        const raw = storage?.getItem(key(name));
        if (!raw) return { cursor: '', outbox: [] };
        const data = JSON.parse(raw) as Partial<TransportSyncState>;
        return {
          cursor: typeof data.cursor === 'string' ? data.cursor : '',
          outbox: Array.isArray(data.outbox) ? data.outbox.filter((id): id is string => typeof id === 'string') : [],
        };
      } catch {
        return { cursor: '', outbox: [] };
      }
    },
    writeCursor(name, cursor) {
      try {
        const cur = this.read(name);
        storage?.setItem(key(name), JSON.stringify({ ...cur, cursor }));
      } catch (e) {
        console.warn('sync cursor not saved', e);
      }
    },
    writeOutbox(name, outboxOpIds) {
      try {
        const cur = this.read(name);
        storage?.setItem(key(name), JSON.stringify({ ...cur, outbox: [...outboxOpIds] }));
      } catch (e) {
        console.warn('sync outbox not saved', e);
      }
    },
  };
}
