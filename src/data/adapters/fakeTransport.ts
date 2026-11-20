// Fake transport (06 rule 4): a shared in-memory "Sheet" that several fake devices talk to.
// Replays trouble on purpose: offline, errors, timeouts, lost acks and duplicate deliveries.
import type { Op } from '../../contract';
import type { Transport } from '../types';

/** `beats`: presence by deviceId with the hub's own time (s127); `presence: false` acts like a 2.0 bridge. */
export interface FakeHub {
  readonly log: Op[]; offline: boolean; failNext: number; duplicatePulls: boolean;
  readonly beats: Map<string, { label: string; orderId: string; at: number }>; presence: boolean; now: () => number;
}
export const createFakeHub = (now: () => number = () => Date.now()): FakeHub =>
  ({ log: [], offline: false, failNext: 0, duplicatePulls: false, beats: new Map(), presence: true, now });

/** Same gap rule as the bridge: a writer whose stored seqs are not 1..max is asked to resend from the first hole. */
function gaps(log: readonly Op[]): { writer: string; fromSeq: number }[] {
  const by = new Map<string, Set<number>>();
  for (const o of log) by.set(o.writer, (by.get(o.writer) ?? new Set()).add(o.seq));
  return [...by].flatMap(([writer, seqs]) => {
    for (let s = 1; s <= Math.max(...seqs); s += 1) if (!seqs.has(s)) return [{ writer, fromSeq: s }];
    return [];
  });
}

export function createFakeTransport(hub: FakeHub, name = 'fake'): Transport {
  const trouble = (): Error | null => {
    if (hub.offline) return new Error('offline');
    if (hub.failNext > 0) { hub.failNext -= 1; return new Error('bridge error'); }
    return null;
  };
  return {
    name,
    push(ops) {
      const err = trouble();
      if (err) return Promise.reject(err);
      const ids = new Set(hub.log.map((o) => o.opId));
      for (const op of ops) if (!ids.has(op.opId)) { ids.add(op.opId); hub.log.push(op); }
      return Promise.resolve({ stored: ops.map((o) => o.opId), resend: gaps(hub.log) });
    },
    beat(b) {
      const err = trouble();
      if (err) return Promise.reject(err);
      if (!hub.presence) return Promise.resolve(null);
      const t = hub.now();
      hub.beats.set(b.deviceId, { label: b.label, orderId: b.orderId, at: t });
      return Promise.resolve([...hub.beats].map(([deviceId, x]) => ({ deviceId, label: x.label, orderId: x.orderId, ageMs: t - x.at })));
    },
    pull(cursor) {
      const err = trouble();
      if (err) return Promise.reject(err);
      const from = Number(cursor) || 0;
      const back = hub.duplicatePulls ? Math.max(0, from - 2) : from;
      return Promise.resolve({ ops: hub.log.slice(back), cursor: String(hub.log.length) });
    },
  };
}
