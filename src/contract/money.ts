// Money is whole paise (integers) everywhere (ARCHITECTURE §4.1). Pure helpers, en-IN grouping.
export type Paise = number;
const PER_RUPEE = 100;

export const rupees = (r: number): Paise => Math.round(r * PER_RUPEE);

/** "₹1,23,456" or "₹12.50"; negative gets a leading minus. */
export function formatInr(p: Paise, opts: { symbol?: boolean } = {}): string {
  const sign = p < 0 ? '−' : '';
  const abs = Math.abs(Math.round(p));
  const whole = Math.floor(abs / PER_RUPEE);
  const frac = abs % PER_RUPEE;
  const grouped = groupIndian(String(whole));
  const tail = frac ? `.${String(frac).padStart(2, '0')}` : '';
  return `${sign}${opts.symbol === false ? '' : '₹'}${grouped}${tail}`;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Parse typed rupees ("12.5", "1,200", "₹40") to paise. Returns null when not a clean amount. */
export function parseRupees(text: string): Paise | null {
  const t = text.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * PER_RUPEE);
}
