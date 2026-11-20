// F-19..F-22 Kitchen and station rules (pure). Q-PILLS-1 A counts, Q-KITCHEN-4 A handed lines stay,
// Q-AUTOPREP next order to Preparing. Orders come in kitchen order: priority first, then oldest first.
import type { Line, LineStatus, Order } from '../../contract';

/** Lines a station still has to make (the pill counts, Q-PILLS-1 A). */
export const TO_MAKE: ReadonlySet<LineStatus> = new Set<LineStatus>(['waiting', 'preparing', 'held', 'paused']);
/** Lines a station is finished with: proposed done, confirmed ready, or handed over. */
const FINISHED: ReadonlySet<LineStatus> = new Set<LineStatus>(['done?', 'ready', 'handed']);

const live = (o: Order): Line[] => o.lines.filter((l) => l.qty > 0 && l.status !== 'draft');
export const linesAt = (o: Order, station: string | null): Line[] => live(o).filter((l) => station === null || l.stationId === station);

/** Q-COMPLETE-2 A (W-06, W-27): a line is complete only when handed over. Ready never completes, whoever marked it. */
export const lineComplete = (l: Line): boolean => l.status === 'handed';
/** Shown muted on kitchen and station views: handed over, or Ready marked by the Counter ("Marked by counter"). */
export const lineMuted = (l: Line): boolean => l.status === 'handed' || (l.status === 'ready' && l.byCounter);
/** Completed for kitchen views once every sent line is complete (Q-OVERLAY veil, then it drops off). */
export const orderComplete = (o: Order): boolean => live(o).length > 0 && live(o).every(lineComplete);

/** Orders the kitchen shows: sent, not deleted or cancelled, not yet completed. */
export function kitchenOrders(orders: readonly Order[]): Order[] {
  return orders
    .filter((o) => !o.deleted && !o.cancel && live(o).some((l) => !lineComplete(l)))
    .map((o, i) => ({ o, i }))
    .sort((a, b) => Number(b.o.priority) - Number(a.o.priority) || a.i - b.i)
    .map((x) => x.o);
}

/** Orders a station page shows: those with a line at this station not yet completed. */
export const stationOrders = (orders: readonly Order[], station: string): Order[] =>
  kitchenOrders(orders).filter((o) => linesAt(o, station).some((l) => !lineComplete(l)));

export function toMake(orders: readonly Order[], station: string | null): number {
  return orders.reduce((n, o) => n + linesAt(o, station).filter((l) => TO_MAKE.has(l.status)).length, 0);
}

/** One tap at a station moves a line on: Waiting → Preparing → Done?; On hold and Paused resume;
 * Ready → Handed over (Q-HANDOVER-1 C: the station may hand over too). */
export function nextStatus(s: LineStatus): LineStatus | null {
  switch (s) {
    case 'waiting': case 'held': case 'paused': return 'preparing';
    case 'preparing': return 'done?';
    case 'ready': return 'handed';
    default: return null; // Done? waits for the Counter (Q-KITCHEN-3 A)
  }
}

export const finishedAt = (o: Order, station: string): boolean => {
  const ls = linesAt(o, station);
  return ls.length > 0 && ls.every((l) => FINISHED.has(l.status));
};

/** Q-AUTOPREP: after `doneId` is finished at `station`, the next order's waiting lines there. */
export function autoPrepLines(orders: readonly Order[], station: string, doneId: string): { order: Order; lines: Line[] } | null {
  const list = stationOrders(orders, station).filter((o) => o.id !== doneId);
  for (const o of list) {
    const ls = linesAt(o, station);
    if (ls.some((l) => l.status === 'preparing')) return null; // the station is already on its next order
    const waiting = ls.filter((l) => l.status === 'waiting');
    if (waiting.length) return { order: o, lines: waiting };
  }
  return null;
}

/** Card meta "1 of 2 handed over" (21-polish2/kitchen.html). */
export function handedMeta(o: Order): string | null {
  const ls = live(o);
  const n = ls.filter((l) => l.status === 'handed').length;
  return n > 0 && n < ls.length ? `${String(n)} of ${String(ls.length)} handed over` : null;
}

/** The order is paused when every line still to make is paused. */
export const isPaused = (o: Order, station: string | null): boolean => {
  const ls = linesAt(o, station).filter((l) => TO_MAKE.has(l.status));
  return ls.length > 0 && ls.every((l) => l.status === 'paused');
};

export interface Overview { readonly items: readonly { name: string; qty: number }[]; readonly split: Readonly<Partial<Record<LineStatus, number>>> }
/** Station Overview (Q-STN-LOOK D): item totals still to make and the status split, across orders. */
export function overview(orders: readonly Order[], station: string): Overview {
  const items = new Map<string, number>();
  const split: Partial<Record<LineStatus, number>> = {};
  for (const o of stationOrders(orders, station)) {
    for (const l of linesAt(o, station)) {
      split[l.status] = (split[l.status] ?? 0) + 1;
      if (TO_MAKE.has(l.status)) items.set(l.name, (items.get(l.name) ?? 0) + l.qty);
    }
  }
  return { items: [...items].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)), split };
}

/** Counter side (Q-KITCHEN-3 A): what the Open orders row offers for this order. */
export function counterStep(o: Order): 'confirm' | 'handover' | null {
  const ls = live(o);
  if (ls.some((l) => l.status === 'done?')) return 'confirm';
  if (ls.some((l) => l.status === 'ready')) return 'handover';
  return null;
}

export interface StatusMove { readonly orderId: string; readonly lineId: string; readonly status: LineStatus }
/**
 * Q-PAUSE-1 A, derived as ops: a station a Priority order still needs pauses the other orders' Preparing lines;
 * once no Priority order needs it, those Paused lines go back to Preparing. A Priority order's own Paused lines resume.
 * Pure and order-independent: the same orders always give the same moves, and applying them gives no further moves.
 */
/** Stations a Priority order still needs. */
export function neededStations(orders: readonly Order[]): Set<string> {
  const lines = kitchenOrders(orders).filter((o) => o.priority).flatMap((o) => linesAt(o, null));
  return new Set(lines.filter((l) => TO_MAKE.has(l.status)).map((l) => l.stationId));
}

export function pauseMoves(orders: readonly Order[]): StatusMove[] {
  const shown = kitchenOrders(orders);
  const needed = neededStations(orders);
  const moves: StatusMove[] = [];
  for (const o of shown) {
    for (const l of linesAt(o, null)) {
      const busy = needed.has(l.stationId) && !o.priority;
      if (busy && l.status === 'preparing') moves.push({ orderId: o.id, lineId: l.lineId, status: 'paused' });
      if (!busy && l.status === 'paused') moves.push({ orderId: o.id, lineId: l.lineId, status: 'preparing' });
    }
  }
  return moves;
}

/** Q-ORDERS-1 Open Orders (2.1.0, W-05/W-08): sent orders until completed, so an unpaid handed-over order stays. */
export { openOrders } from './status';

/** D-OPEN-TAP (Pos): the Counter's hidden tap / card tap moves a line on: Waiting, On hold or Paused → Preparing →
 * Ready → Handed over; a station's proposed Ready (Done?) is confirmed to Ready. Handed over stays. */
export function counterNext(s: LineStatus): LineStatus | null {
  switch (s) {
    case 'waiting': case 'held': case 'paused': return 'preparing';
    case 'preparing': case 'done?': return 'ready';
    case 'ready': return 'handed';
    default: return null;
  }
}

/** Open Orders Overview: item totals still to make and the status split across every station. */
export function overviewAll(orders: readonly Order[]): Overview {
  const items = new Map<string, number>();
  const split: Partial<Record<LineStatus, number>> = {};
  for (const o of kitchenOrders(orders)) {
    for (const l of linesAt(o, null)) {
      if (lineComplete(l)) continue;
      split[l.status] = (split[l.status] ?? 0) + 1;
      if (TO_MAKE.has(l.status)) items.set(l.name, (items.get(l.name) ?? 0) + l.qty);
    }
  }
  return { items: [...items].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)), split };
}

// ---- P3 Kitchen + Station (PK-2, PK-4, PK-10; W-25/26/38/42) ----

/** Plain words for a line status (toasts, PK-4 Undo). */
export const STATUS_WORD: Readonly<Record<LineStatus, string>> = {
  draft: 'Draft', waiting: 'Waiting', preparing: 'Preparing', 'done?': 'Ready', ready: 'Ready', held: 'On hold', handed: 'Handed over', paused: 'Paused',
};

/** W-38 ticket age in whole minutes ("just in" under one minute). */
export function ageText(createdAt: number, now: number): string {
  const m = Math.floor(Math.max(0, now - createdAt) / 60_000);
  return m < 1 ? 'just in' : `${String(m)} min`;
}
/** W-38 age tone: calm, then amber after `amber` minutes, red after `red`. */
export function ageTone(createdAt: number, now: number, amber: number, red: number): 'calm' | 'amber' | 'red' {
  const m = (now - createdAt) / 60_000;
  return m >= red ? 'red' : m >= amber ? 'amber' : 'calm';
}
/** W-25 an order note that names an allergy or a strict diet shows as a warning (whole words, any case). */
export function isWarningNote(note: string, words: readonly string[]): boolean {
  const t = ` ${note.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  return words.some((w) => t.includes(` ${w.toLowerCase()} `));
}
/** W-42 on a station's card its own lines come first, then the other stations' lines (order kept inside each group). */
export function ownFirst(lines: readonly Line[], station: string | null): Line[] {
  if (station === null) return [...lines];
  return [...lines.filter((l) => l.stationId === station), ...lines.filter((l) => l.stationId !== station)];
}

export type LeaveWhy = 'completed' | 'cancelled' | 'handed';
/** PK-10 why an order left a list: cancelled or deleted, completed, or (on a station) handed over here while other
 * stations still have lines ("Handed over", the quiet veil). null = it did not leave for a reason worth a veil. */
export function leaveWhy(cur: Order | undefined, station: string | null): LeaveWhy | null {
  if (!cur || cur.deleted || cur.cancel) return 'cancelled';
  if (orderComplete(cur)) return 'completed';
  if (station !== null && linesAt(cur, station).length > 0 && linesAt(cur, station).every(lineComplete)) return 'handed';
  return null;
}
/** "2 left at other stations" for the Handed over veil. */
export function leftElsewhere(o: Order, station: string): number {
  return live(o).filter((l) => l.stationId !== station && !lineComplete(l)).length;
}
