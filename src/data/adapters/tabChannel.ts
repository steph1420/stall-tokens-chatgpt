// Same-device tabs share new ops over BroadcastChannel (they also share the IndexedDB log).
import { CONFIG } from '../../config';
import { isValidOp } from '../../contract';
import type { TabChannel } from '../types';

export function createTabChannel(): TabChannel {
  const ch = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`${CONFIG.storage.prefix}.ops`);
  return {
    post(ops) { ch?.postMessage(ops); },
    subscribe(listener) {
      if (!ch) return () => undefined;
      const h = (e: MessageEvent<unknown>) => { if (Array.isArray(e.data)) listener(e.data.filter(isValidOp)); };
      ch.addEventListener('message', h);
      return () => { ch.removeEventListener('message', h); };
    },
  };
}
