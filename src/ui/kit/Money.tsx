// Amount with a small ₹ (locked number recipe: ₹ at 0.62em). Paise in, en-IN out.
import { formatInr, type Paise } from '../../contract';
import s from './kit.module.css';

export function Money({ p, className, sign }: { p: Paise; className?: string | undefined; sign?: '−' | '+' | undefined }) {
  const neg = p < 0;
  return (
    <span className={className}>
      {sign ?? (neg ? '−' : '')}<span className={s.rs}>₹</span>{formatInr(Math.abs(p), { symbol: false })}
    </span>
  );
}
