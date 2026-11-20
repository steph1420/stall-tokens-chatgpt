// F-03 F-37 Sync engine: one outbox and pull cursor per transport; any number of transports side by side
// (ARCHITECTURE §4.3). Ops are idempotent by opId, so a lost ack or a repeated pull is harmless.
// Failures are never silent: every error is reported in the status, and polling backs off.
import { CONFIG } from '../../config';
import { isValidOp, type Op } from '../../contract';
import type { Beat, Transport } from '../types';
import type { SyncStateStore } from '../adapters/syncState';

export interface SyncStatus { readonly pending: number; readonly lastOkAt: number | null; readonly error: string | null; readonly online: boolean }
/** s127: a phone heard from, on this device's clock (`heardAt` = now − the bridge's age). */
export interface Presence { readonly deviceId: string; readonly label: string; readonly orderId: string; readonly heardAt: number }
export interface SyncEngine {
  enqueue(ops: readonly Op[]): void;
  /** Rehydrates pending outbox ops from persistent log across reloads (SYNC-P0-01). */
  rehydrate(ops: readonly Op[], deviceIdPrefix: string): void;
  /** One push + pull round on every transport (and a presence beat when given). Resolves with ops new to this device. */
  round(beat?: Beat): Promise<Op[]>;
  /** s127: phones heard from by presence beats; empty when no bridge keeps presence. */
  presence(): readonly Presence[];
  /** True once a bridge has answered a beat (so leases can trust presence, not only ops). */
  hasPresence(): boolean;
  status(): SyncStatus;
  nextDelayMs(): number;
}

interface Lane { t: Transport; outbox: Map<string, Op>; cursor: string; failures: number; noBeat: boolean }

/** Push one batch; drop what was stored; queue a resend of any seq gap the other side reports (Q-HARM-10). */
async function pushLane(l: Lane, batch: readonly Op[], local: (writer: string, fromSeq: number) => readonly Op[], syncState?: SyncStateStore) {
  const r = await l.t.push(batch);
  const got = new Set(r.stored);
  for (const id of got) l.outbox.delete(id);
  const again = r.resend.flatMap((g) => local(g.writer, g.fromSeq)).filter((op) => !got.has(op.opId));
  for (const op of again) l.outbox.set(op.opId, op);
  syncState?.writeOutbox(l.t.name, [...l.outbox.keys()]);
}

/** s127: one presence beat; a bridge without presence (null) is not asked again this load. */
async function beatLane(l: Lane, b: Beat, seen: Map<string, Presence>, now: () => number) {
  if (l.noBeat || !l.t.beat) return;
  const got = await l.t.beat(b);
  if (got === null) { l.noBeat = true; return; }
  const t = now();
  for (const x of got) seen.set(x.deviceId, { deviceId: x.deviceId, label: x.label, orderId: x.orderId, heardAt: t - x.ageMs });
}

async function tryBeat(l: Lane, beat: Beat | undefined, seen: Map<string, Presence>, now: () => number) {
  if (!beat) return;
  try {
    await beatLane(l, beat, seen, now);
  } catch (be) {
    console.warn('presence beat failed, continuing round', be);
  }
}

async function laneRound(l: Lane, local: (w: string, from: number) => readonly Op[], syncState?: SyncStateStore): Promise<Op[]> {
  const batch = [...l.outbox.values()].slice(0, CONFIG.sync.pushBatch);
  if (batch.length) await pushLane(l, batch, local, syncState);
  const { ops, cursor } = await l.t.pull(l.cursor);
  l.cursor = cursor;
  syncState?.writeCursor(l.t.name, cursor);
  return ops.filter(isValidOp);
}

function rehydrateLane(l: Lane, ops: readonly Op[], deviceIdPrefix: string, syncState?: SyncStateStore): void {
  const saved = syncState?.read(l.t.name);
  const opMap = new Map(ops.map((o) => [o.opId, o]));
  if (saved && saved.outbox.length > 0) {
    for (const id of saved.outbox) {
      const op = opMap.get(id);
      if (op) l.outbox.set(op.opId, op);
    }
  } else if (l.cursor === '' && l.outbox.size === 0) {
    const mine = ops.filter((o) => o.writer.startsWith(deviceIdPrefix));
    for (const op of mine) l.outbox.set(op.opId, op);
  }
  syncState?.writeOutbox(l.t.name, [...l.outbox.keys()]);
}

interface RoundEnv {
  lanes: readonly Lane[];
  beat: Beat | undefined;
  seen: Map<string, Presence>;
  now: () => number;
  known: (opId: string) => boolean;
  local: (w: string, from: number) => readonly Op[];
  syncState?: SyncStateStore | undefined;
  onSuccess: (at: number) => void;
  onError: (err: string) => void;
}

async function roundAll(e: RoundEnv): Promise<Op[]> {
  const fresh = new Map<string, Op>();
  for (const l of e.lanes) {
    try {
      await tryBeat(l, e.beat, e.seen, e.now);
      const got = (await laneRound(l, e.local, e.syncState)).filter((op) => !e.known(op.opId));
      got.forEach((op) => fresh.set(op.opId, op));
      l.failures = 0;
      e.onSuccess(e.now());
    } catch (err) {
      l.failures += 1;
      const msg = `${l.t.name}: ${err instanceof Error ? err.message : String(err)}`;
      e.onError(msg);
      console.warn(`sync round failed (${String(l.failures)} in a row)`, msg);
    }
  }
  return [...fresh.values()];
}

/** `local(writer, fromSeq)`: this device's own ops of that writer from that seq, for a gap resend (Q-HARM-10). */
export function createSyncEngine(
  transports: readonly Transport[],
  known: (opId: string) => boolean,
  now: () => number,
  local: (writer: string, fromSeq: number) => readonly Op[] = () => [],
  syncState?: SyncStateStore
): SyncEngine {
  const lanes: Lane[] = transports.map((t) => ({ t, outbox: new Map(), cursor: syncState?.read(t.name).cursor ?? '', failures: 0, noBeat: !t.beat }));
  let lastOkAt: number | null = null;
  let error: string | null = null;
  const seen = new Map<string, Presence>();

  return {
    enqueue(ops) {
      for (const l of lanes) {
        for (const op of ops) l.outbox.set(op.opId, op);
        syncState?.writeOutbox(l.t.name, [...l.outbox.keys()]);
      }
    },
    rehydrate(ops, deviceIdPrefix) {
      for (const l of lanes) rehydrateLane(l, ops, deviceIdPrefix, syncState);
    },
    round(beat) {
      return roundAll({ lanes, beat, seen, now, known, local, syncState, onSuccess: (at) => { lastOkAt = at; error = null; }, onError: (msg) => { error = msg; } });
    },
    presence() { return [...seen.values()]; },
    hasPresence() { return lanes.some((l) => !l.noBeat) && seen.size > 0; },
    status() { return { pending: lanes.reduce((n, l) => Math.max(n, l.outbox.size), 0), lastOkAt, error, online: lanes.length > 0 && error === null }; },
    nextDelayMs() {
      const worst = lanes.reduce((n, l) => Math.max(n, l.failures), 0);
      return Math.min(CONFIG.sync.pollMaxMs, CONFIG.sync.pollMinMs * CONFIG.sync.backoff ** worst);
    },
  };
}
