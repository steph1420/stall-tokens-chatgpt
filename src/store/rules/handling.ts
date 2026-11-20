// s127 take-over lease (Q-TAKE-1a, Q-TAKE-2a; Q-TAKE-LEASE B, Q-TAKE-ALIVE A, Q-TAKE-WHEN A, Q-TAKE-OFFLINE A). Pure.
// The claim is an op (order.handle / order.release, folded by lww so every phone agrees). Whether the holder is still
// there is judged by when THIS phone last heard from it (presence beats or its ops), on this phone's own clock, never by
// comparing two phones' wall clocks.
import { CONFIG } from '../../config';
import type { Order } from '../../contract';
import { completed } from './status';

/** Device ids are compared by their first 8 characters (the op writer prefix). */
export const devKey = (deviceId: string): string => deviceId.slice(0, 8);

export type Holding =
  | { readonly kind: 'free' }
  | { readonly kind: 'mine' }
  | { readonly kind: 'busy'; readonly deviceId: string; readonly label: string };

export interface HeardInfo {
  /** Last time this phone heard from each device (by devKey), on this phone's clock. */
  readonly heard: Readonly<Record<string, number>>;
  /** When this phone's sync started this session (null = no sync set up: only same-phone tabs share orders). */
  readonly since: number | null;
}

/** Can anyone hold this order? Finished, cancelled and deleted orders are free for everyone. */
const holdable = (o: Order): boolean => !o.deleted && !o.cancel && !completed(o);

/**
 * Who has the order now, seen from device `me`.
 * - No claim, or my own claim → free / mine.
 * - Another phone's claim: busy while it was heard from within the lease (90 s). A phone not heard from since this
 *   session started counts as heard at `since` (so a reload waits one lease, or until presence says otherwise).
 */
export function holding(o: Order | undefined, me: string, info: HeardInfo, now: number): Holding {
  const h = o && holdable(o) ? o.handler : null;
  if (!h) return { kind: 'free' };
  if (devKey(h.deviceId) === devKey(me)) return { kind: 'mine' };
  if (info.since === null) return { kind: 'free' };
  const last = Math.max(info.heard[devKey(h.deviceId)] ?? 0, info.since);
  return now - last <= CONFIG.handling.leaseMs ? { kind: 'busy', deviceId: h.deviceId, label: h.label } : { kind: 'free' };
}

/** The name a phone shows to the others: "Counter 2", plus the serving name when set ("Counter 2 · Ravi"). */
export const phoneLabel = (rangeIndex: number, servingName: string): string =>
  [`Counter ${String(rangeIndex + 1)}`, servingName.trim()].filter(Boolean).join(' · ');
