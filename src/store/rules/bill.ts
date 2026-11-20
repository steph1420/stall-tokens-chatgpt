// F-10 F-11 F-18 Bill maths. All paise. Pure.
import type { Discount, Order, Paise } from '../../contract';

export const lineAmount = (l: { price: Paise; qty: number }): Paise => l.price * l.qty;
export const subtotal = (o: Pick<Order, 'lines'>): Paise => o.lines.reduce((t, l) => t + lineAmount(l), 0);

/** Percent rounds to the nearest rupee; the discount never exceeds the subtotal (spec order rules). */
export function discountAmount(sub: Paise, d: Discount | null): Paise {
  if (!d || d.value <= 0) return 0;
  const raw = d.kind === 'pct' ? Math.round((sub * Math.min(d.value, 100)) / 100 / 100) * 100 : d.value;
  return Math.min(Math.max(0, raw), sub);
}

export const discountCapped = (sub: Paise, d: Discount | null): boolean => d !== null && d.kind === 'amount' && d.value > sub;

/** Total before round-off. */
export const preRound = (o: Pick<Order, 'lines' | 'discount'>): Paise => {
  const sub = subtotal(o);
  return sub - discountAmount(sub, o.discount);
};

/** Q-ROUND-1 A: round-off is set at billing against a total; if the bill changes later it no longer applies. */
export function roundOffAmount(o: Pick<Order, 'lines' | 'discount' | 'roundOff'>): Paise {
  if (!o.roundOff) return 0;
  return o.roundOff.forTotal === preRound(o) ? o.roundOff.amount : 0;
}

export const total = (o: Pick<Order, 'lines' | 'discount' | 'roundOff'>): Paise => Math.max(0, preRound(o) + roundOffAmount(o));

/** Refunds that count: a voided (Undo) refund stays on record but gives nothing back (Q-REFUND-INSTANT). */
export const refunded = (o: Pick<Order, 'refunds'>): Paise => o.refunds.reduce((t, r) => t + (r.voided ? 0 : r.amount), 0);
/** Money received for the bill (tips excluded, live refunds taken off, clamped to non-negative, FIN-02). */
export const paid = (o: Pick<Order, 'payments' | 'refunds'>): Paise =>
  Math.max(0, o.payments.reduce((t, p) => t + p.cash + p.upi - p.tip, 0) - refunded(o));
/** Money the stall holds for this order, tips included (what a refund may give back at most, Q-REFUND-1 A). */
export const held = (o: Pick<Order, 'payments' | 'refunds'>): Paise =>
  Math.max(0, o.payments.reduce((t, p) => t + p.cash + p.upi, 0) - refunded(o));
export const waived = (o: Pick<Order, 'payments'>): Paise => o.payments.reduce((t, p) => t + p.waived, 0);
export const tips = (o: Pick<Order, 'payments'>): Paise => o.payments.reduce((t, p) => t + p.tip, 0);

/**
 * Positive = still to collect; negative = refund owed (F-18).
 * P4 fix (D-P4-REFUND-DUE): only the part of a refund that gave back an overpayment counts here (`settled`, set by the fold).
 * Money given back for goods (Q-REFUND-1 A) never makes the customer owe the bill again (it used to put a refunded order on Unpaid).
 */
export function due(o: Order): Paise {
  const got = o.payments.reduce((x, p) => x + p.cash + p.upi - p.tip, 0);
  const settled = o.refunds.reduce((x, r) => x + (r.voided ? 0 : r.settled), 0);
  return total(o) - waived(o) - got + settled;
}

/** Round-off choices for a total: nearest ₹5 / ₹10 down and up, never the same as the total. */
export function roundOffChoices(t: Paise, steps: readonly number[]): Paise[] {
  const out = new Set<Paise>();
  for (const step of steps) {
    const down = Math.floor(t / step) * step;
    const up = Math.ceil(t / step) * step;
    if (down !== t && down >= 0) out.add(down - t);
    if (up !== t) out.add(up - t);
  }
  return [...out].sort((a, b) => a - b);
}
