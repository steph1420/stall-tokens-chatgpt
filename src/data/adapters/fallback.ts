// IndexedDB missing or refusing to open (some private modes): keep working in memory and say so calmly.
// The store shows the warning; nothing is silently lost while the tab stays open (ARCHITECTURE §4 step 3).
import type { OpStore } from '../types';
import { createMemoryOpStore } from './memory';

export function createFallbackOpStore(primary: OpStore | null): OpStore {
  let active: OpStore = primary ?? createMemoryOpStore();
  let persistent = primary !== null;
  return {
    persistent: () => persistent,
    async load() {
      if (!persistent) return active.load();
      try {
        return await active.load();
      } catch (e) {
        console.warn('saved orders unavailable, working in memory', e);
        persistent = false;
        active = createMemoryOpStore();
        return [];
      }
    },
    append: (ops) => active.append(ops),
  };
}
