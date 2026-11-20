// Test helper: a store on memory data, with deterministic ids. Imported by tests only.
import { createDeviceStore, createFakeTransport, createMemoryChannelHub, createMemoryOpStore, type FakeHub } from '../data';
import { createAppStore } from '.';

export function makeTestStore(opts: { hub?: FakeHub; channels?: ReturnType<typeof createMemoryChannelHub>; device?: string; now?: () => number;
  /** Share a device's saved data between two stores (a reload): the same op store and prefs storage. */
  ops?: ReturnType<typeof createMemoryOpStore>; storage?: Storage; idPrefix?: string } = {}) {
  let n = 0;
  const device = opts.device ?? 'dev00001';
  const ops = opts.ops ?? createMemoryOpStore();
  const idp = opts.idPrefix ?? device;
  const store = createAppStore({
    ops, device: createDeviceStore(opts.storage ?? null, () => `${device}-id`), channel: (opts.channels ?? createMemoryChannelHub()).make(),
    transports: opts.hub ? [createFakeTransport(opts.hub)] : [],
  }, { makeId: () => `${idp}-${String(++n)}`, now: opts.now ?? (() => Date.UTC(2026, 10, 16, 10, 0)), loadId: opts.idPrefix ? opts.idPrefix.slice(-2) : 'L1' });
  return { store, ops };
}

/** A Storage on a Map (localStorage stand-in for reload tests). */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => { m.clear(); }, getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, v); },
  };
}

/** P3 (W-30 step gap): a clock that moves on by `stepMs` each time it is read, so back-to-back test taps are real taps. */
export function stepClock(stepMs = 1000, start = Date.UTC(2026, 10, 16, 10, 0)): () => number {
  let t = start;
  return () => (t += stepMs);
}
