// F-09..F-18 Order ops in the fold. Stock moves when lines are committed (sent or paid) and moves back
// when committed qty drops or the order is deleted. Sales may push stock below 0 (offline oversell):
// the count clamps at 0 and the item is flagged `oversold` (plan §8).
import type { Item, Line, Op, Order, Refund, RefundLine } from '../../contract';
import { due, held } from '../rules/bill';
import type { Folded } from './state';
import { lww } from './lww';

type OrderKind = 'order.create' | 'line.add' | 'line.qty' | 'line.note' | 'line.status' | 'line.finish' | 'order.note'
  | 'order.discount' | 'order.roundoff' | 'order.send' | 'order.delete' | 'order.priority' | 'order.cancel' | 'order.client' | 'payment.add' | 'refund.add'
  | 'refund.void' | 'order.complete' | 'order.handle' | 'order.release';
const ORDER_KINDS: ReadonlySet<string> = new Set<OrderKind>([
  'order.create', 'line.add', 'line.qty', 'line.note', 'line.status', 'line.finish', 'order.note', 'order.discount',
  'order.roundoff', 'order.send', 'order.delete', 'order.priority', 'order.cancel', 'order.client', 'payment.add', 'refund.add',
  'refund.void', 'order.complete', 'order.handle', 'order.release',
]);
/** Kinds a cancelled order still takes: money going back, its Undo, and the take-over release (s127). */
const AFTER_CANCEL: ReadonlySet<string> = new Set(['refund.add', 'refund.void', 'order.release']);
export const isOrderOp = (op: Op): op is Op<OrderKind> => ORDER_KINDS.has(op.kind);

function moveStock(items: Folded['items'], itemId: string, sold: number): Folded['items'] {
  const it = items[itemId];
  if (!it || sold === 0) return items;
  const next: Item = it.count === null
    ? { ...it, sold: it.sold + sold }
    : { ...it, sold: it.sold + sold, count: Math.max(0, it.count - sold), oversold: it.count - sold < 0 ? true : sold < 0 ? false : it.oversold };
  return { ...items, [itemId]: next };
}

/** Commit every line: draft lines go to the kitchen (waiting) and their qty leaves stock. */
function commit(s: Folded, o: Order): { state: Folded; order: Order } {
  let items = s.items;
  const lines = o.lines.map((l) => {
    items = moveStock(items, l.itemId, l.qty - l.committed);
    return { ...l, committed: l.qty, status: l.status === 'draft' ? 'waiting' as const : l.status };
  });
  return { state: { ...s, items }, order: { ...o, lines, sent: true } };
}

function withOrder(s: Folded, o: Order): Folded {
  return { ...s, orders: { ...s.orders, [o.id]: o } };
}

function create(s: Folded, op: Op<'order.create'>): Folded {
  if (s.orders[op.body.orderId]) return s;
  const o: Order = {
    id: op.body.orderId, dayId: op.body.dayId, token: Math.trunc(op.body.token), servedBy: op.body.servedBy, createdAt: op.wallAt,
    lines: [], note: '', discount: null, roundOff: null, sent: false, deleted: false, priority: false, client: '', cancel: null, payments: [], refunds: [], revision: 0,
    complete: null, device: typeof op.body.device === 'string' ? op.body.device : '', handler: null,
  };
  return { ...withOrder(s, o), orderIds: [...s.orderIds, o.id] };
}

function setQty(s: Folded, o: Order, lineId: string, rawQty: number): Folded {
  const line = o.lines.find((l) => l.lineId === lineId);
  if (!line) return s;
  const qty = Math.max(0, Math.trunc(rawQty));
  let items = s.items;
  const committed = line.status === 'draft' ? 0 : qty;
  if (committed !== line.committed) items = moveStock(items, line.itemId, committed - line.committed);
  const lines = qty === 0 ? o.lines.filter((l) => l.lineId !== lineId) : o.lines.map((l) => (l.lineId === lineId ? { ...l, qty, committed } : l));
  const revision = o.sent ? o.revision + 1 : o.revision;
  return withOrder({ ...s, items }, { ...o, lines, revision });
}

function addLine(s: Folded, o: Order, b: Op<'line.add'>['body']): Folded {
  if (o.lines.some((l) => l.lineId === b.lineId)) return s;
  const line: Line = { lineId: b.lineId, itemId: b.itemId, name: b.name, price: Math.trunc(b.price), category: b.category,
    stationId: b.stationId, qty: 0, note: '', status: 'draft', committed: 0, byCounter: false, restocked: 0 };
  const next = { ...o, lines: [...o.lines, line] };
  return setQty(withOrder(s, next), next, b.lineId, b.qty);
}

function mapLine(s: Folded, o: Order, lineId: string, f: (l: Line) => Line): Folded {
  return withOrder(s, { ...o, lines: o.lines.map((l) => (l.lineId === lineId ? f(l) : l)) });
}

/** Q-CANCEL-1 A: lines not started give their stock back; started ones were made. Paid money is flagged as refund due. */
const NOT_STARTED: ReadonlySet<string> = new Set(['draft', 'waiting', 'held', 'paused']);
function cancel(s: Folded, o: Order, op: Op<'order.cancel'>): Folded {
  let items = s.items;
  for (const l of o.lines) if (NOT_STARTED.has(l.status)) items = moveStock(items, l.itemId, -l.committed);
  const lines = o.lines.map((l) => (NOT_STARTED.has(l.status) ? { ...l, committed: 0 } : l));
  const refundDue = held(o);
  return withOrder({ ...s, items }, { ...o, lines, cancel: { reason: op.body.reason.trim(), at: op.wallAt, by: op.writer, refundDue: Math.max(0, refundDue) } });
}

function remove(s: Folded, o: Order): Folded {
  let items = s.items;
  for (const l of o.lines) items = moveStock(items, l.itemId, -l.committed);
  return withOrder({ ...s, items }, { ...o, deleted: true, lines: o.lines.map((l) => ({ ...l, committed: 0 })) });
}

/** Kitchen status ops. The "Marked by counter" label (Q-COUNTER-FINISH) lasts while the line stays Ready or Handed over. */
function lineStatus(s: Folded, o: Order, op: Op<'line.status'> | Op<'line.finish'>): Folded {
  if (op.kind === 'line.finish') return mapLine(s, o, op.body.lineId, (l) => (l.status === 'draft' || l.status === 'handed' ? l : { ...l, status: 'ready', byCounter: true }));
  const status = op.body.status;
  return mapLine(s, o, op.body.lineId, (l) => (l.status === 'draft' ? l : { ...l, status, byCounter: l.byCounter && (status === 'ready' || status === 'handed') }));
}

/** Q-REFUND-1 A back-to-stock: applied once per refund (the refundId is unique on the order), and only up to what the
 * line still has out of stock (committed − already restocked). Returns what was actually put back. */
function restock(s: Folded, o: Order, want: readonly RefundLine[]): { state: Folded; order: Order; done: RefundLine[] } {
  let items = s.items;
  const done: RefundLine[] = [];
  const lines = o.lines.map((l) => {
    const ask = want.filter((w) => w.lineId === l.lineId).reduce((t, w) => t + Math.max(0, Math.trunc(w.qty)), 0);
    const qty = Math.min(ask, Math.max(0, l.committed - l.restocked));
    if (qty <= 0) return l;
    items = moveStock(items, l.itemId, -qty);
    done.push({ lineId: l.lineId, qty });
    return { ...l, restocked: l.restocked + qty };
  });
  return { state: { ...s, items }, order: { ...o, lines }, done };
}

function addRefund(s: Folded, o: Order, op: Op<'refund.add'>): Folded {
  if (o.refunds.some((x) => x.refundId === op.body.refundId)) return s;
  // Never give back more than the stall holds for this order (two phones refunding at once: the later one is capped).
  const amount = Math.max(0, Math.min(Math.trunc(op.body.amount), held(o)));
  const lines = (op.body.lines ?? []).map((l) => ({ lineId: l.lineId, qty: Math.trunc(l.qty) }));
  const r = op.body.restock === true ? restock(s, o, lines) : { state: s, order: o, done: [] };
  const settled = Math.min(amount, Math.max(0, -due(o)));
  const refund: Refund = { refundId: op.body.refundId, amount, source: op.body.source, at: op.wallAt, reason: (op.body.reason ?? '').trim(), lines, restocked: r.done, voided: null, settled };
  return withOrder(r.state, { ...r.order, refunds: [...r.order.refunds, refund] });
}

/** Q-REFUND-INSTANT Undo: the refund stays, marked voided; its back-to-stock is taken out again. Once only. */
function voidRefund(s: Folded, o: Order, op: Op<'refund.void'>): Folded {
  const ref = o.refunds.find((x) => x.refundId === op.body.refundId);
  if (!ref || ref.voided !== null) return s;
  let items = s.items;
  const lines = o.lines.map((l) => {
    const qty = ref.restocked.filter((x) => x.lineId === l.lineId).reduce((t, x) => t + x.qty, 0);
    if (qty <= 0) return l;
    items = moveStock(items, l.itemId, qty);
    return { ...l, restocked: Math.max(0, l.restocked - qty) };
  });
  const refunds = o.refunds.map((x) => (x.refundId === ref.refundId ? { ...x, voided: op.body.reason.trim() || 'Undo' } : x));
  return withOrder({ ...s, items }, { ...o, lines, refunds });
}

/** Q-COMPLETE-2 A: Complete. Recorded through lww(order, 'complete') so a concurrent payment is a Conflict row (never
 * silent); the payment's money is kept either way, and a later payment clears the write-off (see rules/status). */
function completeOrder(s: Folded, o: Order, op: Op<'order.complete'>): Folded {
  const w = lww(s, `order:${o.id}`, 'complete', op);
  if (!w.apply) return w.state;
  const complete = { unpaid: op.body.unpaid, dueAt: Math.trunc(op.body.dueAt), reason: op.body.reason.trim(), at: op.wallAt, by: op.writer };
  return withOrder(w.state, { ...o, complete });
}

/** s127 lease: claim / take over / release through lww(order, 'handler'), so two phones taking over at once end the
 * same way on every device (causal order) and the clash is a Conflict row. A release only clears its own claim. */
function handleOrder(s: Folded, o: Order, op: Op<'order.handle' | 'order.release'>): Folded {
  if (op.kind === 'order.release' && o.handler?.deviceId !== op.body.deviceId) return s;
  const w = lww(s, `order:${o.id}`, 'handler', op);
  if (!w.apply) return w.state;
  const handler = op.kind === 'order.handle' ? { deviceId: op.body.deviceId, label: op.body.label, at: op.wallAt, takeover: op.body.takeover } : null;
  return withOrder(w.state, { ...o, handler });
}

/** Order fields set by last-writer-wins honour `apply` (a Sheet edit that wins keeps its value; plan §3 latent bug). */
function setField<K extends 'note' | 'client' | 'priority' | 'discount' | 'roundOff'>(s: Folded, o: Order, field: K, op: Op, value: Order[K]): Folded {
  const w = lww(s, `order:${o.id}`, field, op);
  return w.apply ? withOrder(w.state, { ...o, [field]: value }) : w.state;
}

export function applyOrderOp(s: Folded, op: Op<OrderKind>): Folded {
  if (op.kind === 'order.create') return create(s, op);
  const o = s.orders[op.body.orderId];
  if (!o || o.deleted) return s; // ops for unknown or deleted orders are kept in the log but change nothing
  if (o.cancel && !AFTER_CANCEL.has(op.kind)) return s; // a cancelled order only takes refunds (and their Undo)
  switch (op.kind) {
    case 'line.add': return addLine(s, o, op.body);
    case 'line.qty': return setQty(s, o, op.body.lineId, op.body.qty);
    case 'line.note': {
      const w = lww(s, `line:${op.body.lineId}`, 'note', op);
      return w.apply ? mapLine(w.state, o, op.body.lineId, (l) => ({ ...l, note: op.body.note })) : w.state;
    }
    case 'line.status': case 'line.finish': return lineStatus(s, o, op);
    case 'order.note': return setField(s, o, 'note', op, op.body.note);
    case 'order.discount': {
      const { kind, value, allowedBy, note } = op.body;
      return setField(s, o, 'discount', op, value > 0 ? { kind, value: Math.trunc(value), allowedBy, note } : null);
    }
    case 'order.roundoff':
      return setField(s, o, 'roundOff', op, op.body.amount === 0 ? null : { amount: Math.trunc(op.body.amount), forTotal: Math.trunc(op.body.forTotal) });
    case 'order.send': { const r = commit(s, o); return withOrder(r.state, r.order); }
    case 'order.delete': return remove(s, o);
    case 'order.cancel': return cancel(s, o, op);
    case 'order.client': return setField(s, o, 'client', op, op.body.name);
    case 'order.priority': return setField(s, o, 'priority', op, op.body.on);
    case 'payment.add': {
      if (o.payments.some((p) => p.paymentId === op.body.paymentId)) return s;
      const { orderId: _o, ...b } = op.body;
      // Touches the 'complete' target so a payment made without having seen a concurrent Complete is recorded as a
      // Conflict row (Q-HARM-10). Money ops only add: the payment always lands, whatever the order of the two.
      const st = lww(s, `order:${o.id}`, 'complete', op).state;
      const r = commit(st, o);
      return withOrder(r.state, { ...r.order, payments: [...o.payments, { ...b, at: op.wallAt, writer: op.writer }] });
    }
    case 'refund.add': return addRefund(s, o, op);
    case 'refund.void': return voidRefund(s, o, op);
    case 'order.complete': return completeOrder(s, o, op);
    case 'order.handle': case 'order.release': return handleOrder(s, o, op);
  }
}
