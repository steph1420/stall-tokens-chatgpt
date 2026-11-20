// Memory op store and tab channel (tests, and the fallback when IndexedDB is missing). Can fail on purpose.
import type { Op } from '../../contract';
import type { OpStore, TabChannel } from '../types';

export interface MemoryOpStore extends OpStore { readonly all: Op[]; failNext: number }

export function createMemoryOpStore(initial: readonly Op[] = []): MemoryOpStore {
  const all: Op[] = [...initial];
  const ids = new Set(all.map((o) => o.opId));
  const store: MemoryOpStore = {
    all,
    failNext: 0,
    load: () => Promise.resolve([...all]),
    append(ops) {
      if (store.failNext > 0) {
        store.failNext -= 1;
        return Promise.reject(new DOMException('Storage is full', 'QuotaExceededError'));
      }
      for (const op of ops) if (!ids.has(op.opId)) { ids.add(op.opId); all.push(op); }
      return Promise.resolve();
    },
  };
  return store;
}

/** A pair of linked channels, like two tabs. */
export function createMemoryChannelHub(): { make: () => TabChannel } {
  const members = new Set<(ops: Op[]) => void>();
  return {
    make() {
      let mine: ((ops: Op[]) => void) | null = null;
      return {
        post(ops) { for (const m of members) if (m !== mine) m([...ops]); },
        subscribe(listener) { mine = listener; members.add(listener); return () => { members.delete(listener); }; },
      };
    },
  };
}
