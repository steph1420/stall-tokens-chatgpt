// F-15 Dynamic UPI link (upi://pay with pa, pn, am, tn), made offline. Confirmation stays manual (Q-UPI-1 A).
import type { Paise } from '../../contract';

const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/;
export const isUpiId = (s: string): boolean => UPI_ID.test(s.trim());

export function upiLink(upiId: string, name: string, amount: Paise, note: string): string {
  const am = (amount / 100).toFixed(2);
  const q = new URLSearchParams({ pa: upiId.trim(), pn: name.trim(), am, cu: 'INR', tn: note });
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

/** pa and am as encoded in the link (decoded). Null when either is missing. */
export function readUpiLink(link: string): { upiId: string; amount: string } | null {
  const q = link.split('?')[1];
  if (!q) return null;
  const p = new URLSearchParams(q);
  const upiId = p.get('pa');
  const amount = p.get('am');
  if (!upiId || amount === null || amount === '') return null;
  return { upiId, amount };
}

/** ₹ + the link's am; trailing .00 is dropped so paise show only when the link has them. */
export function formatQrAmount(am: string): string {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(am.trim());
  const whole = m?.[1];
  if (!m || whole === undefined) return `₹${am}`;
  const frac = (m[2] ?? '').replace(/0+$/, '');
  return frac ? `₹${whole}.${frac.padEnd(2, '0')}` : `₹${whole}`;
}

export function upiQrFacts(link: string): { upiId: string; amountText: string } | null {
  const r = readUpiLink(link);
  return r ? { upiId: r.upiId, amountText: formatQrAmount(r.amount) } : null;
}
