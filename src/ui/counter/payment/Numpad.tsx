// Number pad (03-payment v5): 1–9, 00, 0, ⌫, Done. Whole rupees; capped at the money limit.
import { useState } from 'react';
import { useSheetDrag } from '../../kit/sheetDrag';
import { Icon } from '../../kit/Icon';
import { KEYS, nextAmount, type Key } from '../../kit/keypad';
import s from './Payment.module.css';

export function Numpad({ side, rupees, onChange, onDone }: { side?: string | undefined; rupees: number; onChange: (r: number) => void; onDone: () => void }) {
  const [fresh, setFresh] = useState(true); // the first key replaces the shown amount
  const press = (k: Key) => {
    const n = nextAmount(rupees, k, fresh);
    setFresh(false);
    if (n !== null) onChange(n);
  };
  const { y, handle } = useSheetDrag(onDone);
  const label = side === 'cash' ? 'Cash' : side === 'upi' ? 'UPI' : side === 'tip' ? 'Tip' : side === 'waive' ? 'Waive' : (side ?? 'Amount');
  const tagClass = side ? s[`padSide_${side}`] ?? '' : '';
  return (
    <div className={s.padWrap}>
      <button type="button" className={s.padScrim} aria-label="Close" onClick={onDone} />
      <div className={s.pad} role="dialog" aria-label="Number pad" style={{ transform: `translateY(${String(y)}px)` }}>
        <div className={s.padGrab} aria-hidden="true" {...handle} />
        <div className={s.padHeader}>
          <span className={[s.padSideTag, tagClass].join(' ')}>{label}</span>
        </div>
        <div className={s.padInputBox} aria-label={`${label} amount`} aria-live="polite">
          <span className={s.padCurrency}>₹</span>
          <span className={s.padValue}>{rupees.toLocaleString('en-IN')}</span>
        </div>
        <div className={s.keys}>
          {KEYS.map((k) => (
            <button type="button" key={k} className={k === 'del' || k === '00' ? s.keyUtil : s.key} aria-label={k === 'del' ? 'Delete' : k} onClick={() => { press(k); }}>
              {k === 'del' ? <Icon name="backspace" className={s.bs} /> : k}
            </button>
          ))}
        </div>
        <button type="button" className={s.padDone} onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
