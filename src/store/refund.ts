// F-51 Q-REFUND-1 A + Q-REFUND-INSTANT (2.1.0 P1, data + rules; the Refund sheet is P2). One refund action for Open Orders,
// History and Unpaid: whole / lines / custom amount, reason chip, Cash or UPI, optional back to stock. Instant, then
// a 5 s Undo, which writes `refund.void` (a compensating op, never a delete). A refund never cancels the order.
import { CONFIG } from '../config';
import { formatInr, type Order, type PaySource, type RefundLine } from '../contract';
import type { Core, Log } from './core';
import { held } from './rules/bill';

export type RefundAsk =
  | { kind: 'whole' }
  | { kind: 'lines'; lines: readonly RefundLine[] }
  | { kind: 'custom'; amount: number };
export interface RefundRequest { orderId: string; ask: RefundAsk; source: PaySource; reason: string; restock: boolean }
export type RefundResult = { ok: true; refundId: string; amount: number } | { ok: false; reason: string };

/** Qty of a line already refunded by live refunds. */
const refundedQty = (o: Order, lineId: string): number =>
  o.refunds.filter((r) => r.voided === null).flatMap((r) => r.lines).filter((l) => l.lineId === lineId).reduce((t, l) => t + l.qty, 0);

/** Pure: what a refund request gives back, or why it can't (never more than the stall holds for the order). */
export function planRefund(o: Order, ask: RefundAsk): { amount: number; lines: RefundLine[] } | string {
  const max = held(o);
  if (max <= 0) return 'Nothing was paid for this order';
  if (ask.kind === 'whole') return { amount: max, lines: o.lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.lineId, qty: l.qty - refundedQty(o, l.lineId) })).filter((l) => l.qty > 0) };
  if (ask.kind === 'custom') {
    const a = Math.trunc(ask.amount);
    if (!Number.isSafeInteger(a) || a <= 0) return 'Type an amount';
    return a > max ? `At most ${formatInr(max)} can be refunded` : { amount: a, lines: [] };
  }
  let amount = 0;
  const lines: RefundLine[] = [];
  for (const pick of ask.lines) {
    const l = o.lines.find((x) => x.lineId === pick.lineId);
    const q = Math.trunc(pick.qty);
    if (!l || q <= 0) continue;
    if (q > l.qty - refundedQty(o, l.lineId)) return `${l.name}: that is more than was ordered`;
    amount += l.price * q;
    lines.push({ lineId: l.lineId, qty: q });
  }
  if (!lines.length) return 'Pick what to refund';
  return { amount: Math.min(amount, max), lines };
}

export function refundActions(core: Core, log: Log) {
  const st = () => core.get();
  const toast = (text: string) => { core.set((s) => ({ ui: { ...s.ui, toast: { text, id: (s.ui.toast?.id ?? 0) + 1 } } })); };
  const self = {
    /** Instant refund (one tap). Returns the refundId for the Undo toast. */
    refund(req: RefundRequest): RefundResult {
      const o = st().folded.orders[req.orderId];
      if (!o || o.deleted) return { ok: false, reason: 'No such order' };
      const plan = planRefund(o, req.ask);
      if (typeof plan === 'string') return { ok: false, reason: plan };
      const refundId = core.env.makeId();
      log.dispatch('refund.add', { refundId, orderId: o.id, amount: plan.amount, source: req.source,
        reason: req.reason.trim().slice(0, CONFIG.limits.noteMaxChars), lines: plan.lines, restock: req.restock && plan.lines.length > 0 });
      return { ok: true, refundId, amount: plan.amount };
    },
    /** s122 Refund in one tap: the whole order, back the way most of it was paid; the toast offers Undo. */
    quick(orderId: string): RefundResult {
      const o = st().folded.orders[orderId];
      const cash = o ? o.payments.reduce((t, p) => t + p.cash, 0) : 0;
      const upi = o ? o.payments.reduce((t, p) => t + p.upi, 0) : 0;
      return self.offer({ orderId, ask: { kind: 'whole' }, source: upi > cash ? 'upi' : 'cash', reason: '', restock: false });
    },
    /** Refund, then a calm toast "Refunded ₹X · Cash" with Undo (or the reason it could not, in plain words). */
    offer(req: RefundRequest): RefundResult {
      const r = self.refund(req);
      if (!r.ok) { toast(r.reason); return r; }
      const how = req.source === 'upi' ? 'UPI' : 'Cash';
      core.set((s) => ({ ui: { ...s.ui, toast: { text: `Refunded ${formatInr(r.amount)} · ${how}`, id: (s.ui.toast?.id ?? 0) + 1, action: { label: 'Undo', run: 'undoRefund', orderId: req.orderId, refundId: r.refundId } } } }));
      return r;
    },
    /** Undo (5 s toast): the refund stays on record, voided; stock it put back is taken out again. */
    undo(orderId: string, refundId: string): boolean {
      const r = st().folded.orders[orderId]?.refunds.find((x) => x.refundId === refundId);
      if (!r || r.voided !== null) return false;
      log.dispatch('refund.void', { refundId, orderId, reason: 'Undo' });
      toast('Refund undone');
      return true;
    },
  };
  return self;
}
export type RefundActions = ReturnType<typeof refundActions>;
