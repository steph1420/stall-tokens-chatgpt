// pay3 calculator (standalone; changes nothing in the order by itself). Pure: a key in, the next state out.
// Left-to-right like a pocket calculator (2 + 3 × 4 = 20). Divide by zero shows "Can't divide by 0" and clears.
export type CalcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '+' | '−' | '×' | '÷' | '=' | 'C' | 'del';
type Op = '+' | '−' | '×' | '÷';
export interface Calc { readonly shown: string; readonly acc: number | null; readonly op: Op | null; readonly fresh: boolean; readonly error: string }

export const CALC_MAX_DIGITS = 12;
export const calcStart: Calc = { shown: '0', acc: null, op: null, fresh: true, error: '' };

/** Rounded to 2 decimals for money; trailing zeros dropped. */
export const fmt = (n: number): string => String(Math.round(n * 100) / 100);

function apply(a: number, op: Op, b: number): number | null {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  return b === 0 ? null : a / b;
}

function typeDigit(c: Calc, k: CalcKey): Calc {
  const base = c.fresh || c.error ? '0' : c.shown;
  if (k === '.') return base.includes('.') ? { ...c, error: '' } : { ...c, shown: `${base}.`, fresh: false, error: '' };
  if (base.replace(/[^0-9]/g, '').length >= CALC_MAX_DIGITS) return c;
  return { ...c, shown: base === '0' ? k : base + k, fresh: false, error: '' };
}

function operate(c: Calc, next: Op | null): Calc {
  const b = Number(c.shown);
  if (c.acc === null || c.op === null || c.fresh) return { ...c, acc: c.fresh && c.acc !== null && next ? c.acc : b, op: next, fresh: true, error: '' };
  const r = apply(c.acc, c.op, b);
  if (r === null) return { ...calcStart, error: 'Can\'t divide by 0' };
  return { shown: fmt(r), acc: next ? r : null, op: next, fresh: true, error: '' };
}

export function press(c: Calc, k: CalcKey): Calc {
  if (k === 'C') return calcStart;
  if (k === 'del') return c.fresh ? c : { ...c, shown: c.shown.length > 1 ? c.shown.slice(0, -1) : '0' };
  if (k === '=') return operate(c, null);
  if (k === '+' || k === '−' || k === '×' || k === '÷') return operate(c, k);
  return typeDigit(c, k);
}

/** The result as paise for "Use as Cash / UPI" (null when not a positive amount). */
export const calcPaise = (c: Calc): number | null => { const n = Number(c.shown); return Number.isFinite(n) && n > 0 && !c.error ? Math.round(n * 100) : null; };
