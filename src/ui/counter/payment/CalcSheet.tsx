// F-63 pay3 calculator: a plain big-key calculator for staff who'd rather work it out by hand. Standalone: it changes
// nothing in the order unless "Use as Cash" / "Use as UPI" is tapped (that side then locks, D-PAY3-4).
import { useState } from 'react';
import { calc, type pay } from '../../../store';
import { Icon } from '../../kit/Icon';
import { Sheet } from '../../kit/Sheet';
import s from './Calc.module.css';

const KEYS: readonly (readonly [calc.CalcKey, string])[] = [
  ['C', 'Clear'], ['del', 'Delete'], ['÷', 'Divide'], ['×', 'Times'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['−', 'Minus'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['+', 'Plus'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['=', 'Equals'],
  ['0', '0'], ['.', 'Point'],
];
const keyClass = (k: calc.CalcKey): string | undefined => (k === '=' ? s.kEq : k === '0' ? s.kZero : /[0-9.]/.test(k) ? s.k : k === 'C' || k === 'del' ? s.kUtil : s.kOp);

export function CalcSheet({ due, onClose, onUse }: { due: number; onClose: () => void; onUse: (side: pay.Side, paise: number) => void }) {
  const [c, setC] = useState(calc.calcStart);
  const paise = calc.calcPaise(c);
  const pending = c.acc !== null && c.op ? `${calc.fmt(c.acc)} ${c.op}` : '';
  return (
    <Sheet label="Calculator" onClose={onClose}>
      <div className={s.screen} aria-live="polite">
        <div className={s.pending}>{c.error || pending || '\u00a0'}</div>
        <output className={s.shown} aria-label="Result">{c.shown}</output>
      </div>
      <div className={s.keys}>
        {KEYS.map(([k, label]) => (
          <button type="button" key={k} className={keyClass(k)} aria-label={label} onClick={() => { setC(calc.press(c, k)); }}>
            {k === 'del' ? <Icon name="backspace" className={s.bs} /> : k}
          </button>
        ))}
      </div>
      {paise !== null && due > 0 ? (
        <div className={s.use}>
          <button type="button" className={s.useBtn} onClick={() => { onUse('cash', paise); }}>Use as Cash</button>
          <button type="button" className={s.useBtn} onClick={() => { onUse('upi', paise); }}>Use as UPI</button>
        </div>
      ) : null}
      <button type="button" className={s.close} onClick={onClose}>Close</button>
    </Sheet>
  );
}
