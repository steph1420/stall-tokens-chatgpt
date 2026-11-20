// F-50 F-05 Order status words for the strip and Open orders. "Paying"/"Editing" come from this device's
// UI place for the order; everything else from the folded order.
// 2.1.0 (Q-HANDOVER-PAY revised, Q-COMPLETE-2 A): Ready never completes, whoever marks it. An order is completed only by
// Handover + paid, or by Complete. Handover while money is due leaves it open as Unpaid (W-05, W-08).
import type { Order } from '../../contract';
import { due } from './bill';

export type OrderStatus = 'New' | 'Editing' | 'Paying' | 'Kitchen' | 'Ready' | 'Unpaid' | 'Handed over' | 'Done' | 'Written off' | 'Refund';
export type Page = 'menu' | 'billing' | 'payment';

const liveLines = (o: Order) => o.lines.filter((l) => l.qty > 0);
/** Every sent line is handed over. */
export const allHanded = (o: Order): boolean => { const ls = liveLines(o); return ls.length > 0 && ls.every((l) => l.status === 'handed'); };

/** Completed (Q-COMPLETE-2 A) = a Complete op, or every line handed over and nothing due. Never by Ready alone. */
export const completed = (o: Order): boolean => !o.deleted && !o.cancel && (o.complete !== null || (o.sent && allHanded(o) && due(o) <= 0));
/** Completed without payment while money is still due. A later payment clears it (the fold keeps every payment). */
export const writtenOff = (o: Order): boolean => o.complete?.unpaid === true && !o.deleted && !o.cancel && due(o) > 0;
/** Sent, money still to collect, not written off (the Unpaid tab and count). */
export const unpaid = (o: Order): boolean => !o.deleted && !o.cancel && o.sent && due(o) > 0 && !writtenOff(o);

export function orderStatus(o: Order, page: Page | undefined): OrderStatus {
  const live = liveLines(o);
  if (live.length === 0 && o.payments.length === 0) return 'New';
  const owed = due(o);
  if (owed < 0) return 'Refund';
  if (writtenOff(o)) return 'Written off';
  if (o.complete) return 'Done';
  const hasDraft = live.some((l) => l.status === 'draft');
  if (!o.sent || hasDraft) return page === 'payment' ? 'Paying' : 'Editing';
  if (allHanded(o)) return owed > 0 ? 'Unpaid' : 'Handed over';
  if (live.every((l) => l.status === 'ready' || l.status === 'handed')) return 'Ready';
  return 'Kitchen';
}

/** An order stays open (Counter Open Orders) until it is completed or cancelled. Unpaid handed-over orders stay open. */
export const isOpen = (o: Order): boolean => !o.deleted && !o.cancel && !completed(o);

/** Open Orders list (Q-ORDERS-1, W-05): sent orders still open, priority first, then oldest first. */
export function openOrders(orders: readonly Order[]): Order[] {
  return orders
    .filter((o) => o.sent && isOpen(o))
    .map((o, i) => ({ o, i }))
    .sort((a, b) => Number(b.o.priority) - Number(a.o.priority) || a.i - b.i)
    .map((x) => x.o);
}
/** The Unpaid tab (s120, Q-UNPAID-ROW B): open orders with money still to collect, oldest first. */
export const unpaidOrders = (orders: readonly Order[]): Order[] => orders.filter(unpaid);

/** s123 Drafts: unsent, unpaid orders with items, from every Counter (Q-DRAFT-SYNC). */
export const draftOrders = (orders: readonly Order[]): Order[] =>
  orders.filter((o) => !o.deleted && !o.cancel && !o.sent && o.payments.length === 0 && o.lines.some((l) => l.qty > 0));
