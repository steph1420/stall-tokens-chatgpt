// Payment parts: tip chips (F-17, D-TIP), Waived row, Count notes with change (F-16).
import { useState } from 'react';
import { CONFIG } from '../../../config';
import type { Paise } from '../../../contract';
import { amounts, useApp } from '../../../store';
import { Icon } from '../../kit/Icon';
import { Money } from '../../kit/Money';
import s from './Payment.module.css';

type Adj = 'tip' | 'waive';

/** pay2 (locked): the amount due changes only here. Two small pills, "+ Tip" and "− Waive"; a tap opens quick chips
 * (₹10, ₹20, Other). Kept small on purpose (rare, and they change what is owed). */
/** pay4 (D-PAY4-1): + Tip and − Waive are twins: same pill, same chips (₹10, ₹20, Other), Undo toast.
 *  Tap a lit chip to take it off; an Other amount shows as its own lit chip. Other keeps the chips open (the pad
 *  must not collapse the picker). Who / Allowed by lives on a note under the amounts, not on the picker. */
export function AdjustRow({ tip, waived, onPick, onOther }: { tip: Paise; waived: Paise; onPick: (k: Adj, p: Paise) => void; onOther: (k: Adj) => void }) {
  const tipChips = useApp((x) => amounts.amounts(x.folded.settings, 'tipChips'));
  const [open, setOpen] = useState<Adj | null>(null);
  const base: readonly Paise[] = open === 'tip' ? tipChips : CONFIG.payment.waiveChips;
  const now = open === 'tip' ? tip : waived;
  const chips = now > 0 && !base.includes(now) ? [...base, now] : base;
  const pick = (k: Adj, p: Paise) => { onPick(k, p); setOpen(null); };
  const pill = (k: Adj, label: string, v: Paise, off: string | undefined, on: string | undefined) => (
    <button type="button" className={v > 0 || open === k ? on : off} aria-expanded={open === k} onClick={() => { setOpen(open === k ? null : k); }}>{label}{v > 0 ? <> <Money p={v} /></> : null}</button>
  );
  return (
    <div className={s.adjBlock}>
      <div className={s.adjPills}>
        {pill('tip', '+ Tip', tip, s.pillTip, s.pillTipOn)}
        {pill('waive', '− Waive', waived, s.pillWaive, s.pillWaiveOn)}
      </div>
      {open ? (
        <div className={s.adjChips} role="group" aria-label={open === 'tip' ? 'Tip' : 'Waive'}>
          {chips.map((p) => <button type="button" key={p} aria-pressed={now === p} className={now === p ? s.chipOn : s.chip} onClick={() => { pick(open, now === p ? 0 : p); }}><Money p={p} /></button>)}
          <button type="button" className={s.chip} onClick={() => { onOther(open); }}>Other</button>
        </div>
      ) : null}
    </div>
  );
}

const SWATCH_OF: Readonly<Record<number, number>> = { 5: 7, 10: 1, 20: 5, 50: 3, 100: 0, 200: 2, 500: 4, 1000: 6, 2000: 1 };

export function CountNotes({ notes, onNotes, heading = true }: { notes: Record<string, number>; onNotes: (n: Record<string, number>) => void; heading?: boolean }) {
  const [showMore, setShowMore] = useState(false);
  const more = showMore || Object.keys(notes).some((k) => (CONFIG.payment.moreDenominations as readonly number[]).includes(Number(k)) && (notes[k] ?? 0) > 0);
  const list: readonly number[] = more ? [...CONFIG.payment.denominations, ...CONFIG.payment.moreDenominations] : CONFIG.payment.denominations;
  const set = (d: number, n: number) => { onNotes({ ...notes, [String(d)]: Math.max(0, Math.min(CONFIG.limits.qtyMax, n)) }); };
  return (
    <section className={s.notes} aria-label="Count notes">
      {heading ? <div className={s.notesH}>Count notes <em>· optional</em></div> : null}
      <div className={s.dgrid}>
        {list.map((d) => {
          const n = notes[String(d)] ?? 0;
          return (
            <div key={d} className={n > 0 ? s.dcardIn : s.dcard} style={{ '--item-accent': `var(--dl-stall-swatch-${String(SWATCH_OF[d] ?? 0)})` } as React.CSSProperties}>
              <button type="button" className={s.dhit} aria-label={`Add a ₹${String(d)} note`} onClick={() => { set(d, n + 1); }} />
              <span className={s.daccent} />
              <Money p={d * 100} className={s.dval} />
              {n > 0 ? (
                <div className={s.dqty}>
                  <button type="button" className={s.qb} aria-label={`One less ₹${String(d)}`} onClick={() => { set(d, n - 1); }}>−</button>
                  <span className={s.qn}>{n}</span>
                  <button type="button" className={s.qb} aria-label={`One more ₹${String(d)}`} onClick={() => { set(d, n + 1); }}>+</button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!more ? <button type="button" className={s.moreNotes} onClick={() => { setShowMore(true); }}>More notes</button> : null}
      </div>
    </section>
  );
}

export type PayMethod = 'cash' | 'upi' | 'split';

/** D-PAY5-1 / s129b: tall Cash | UPI | Split. Cash and UPI are wider and show the whole amount; Split is quieter. */
export function MethodSeg({ method, due, onPick }: { method: PayMethod | null; due: Paise; onPick: (m: PayMethod) => void }) {
  const cashAmt = method === null || method === 'cash' ? due : null;
  const upiAmt = method === null || method === 'upi' ? due : null;
  const btn = (m: PayMethod, label: string, amt: Paise | null, tone: string) => {
    const on = method === m;
    const name = amt === null ? label : `${label} ₹${String(amt / 100)}`;
    const cls = [on ? s.segOn : s.segBtn, tone].join(' ');
    return (
      <button type="button" className={cls} aria-pressed={on} aria-label={name} onClick={() => { onPick(m); }}>
        <span className={s.segLab}>{label}</span>
        {amt !== null ? <Money p={amt} className={s.segAmt} /> : null}
      </button>
    );
  };
  return (
    <div className={s.seg} role="group" aria-label="How to pay">
      {btn('cash', 'Cash', cashAmt, s.segCash ?? '')}
      {btn('upi', 'UPI', upiAmt, s.segUpi ?? '')}
      {btn('split', 'Split', null, s.segSplit ?? '')}
    </div>
  );
}

/** D-PAY5-1: inline Count notes drawer. Open/closed is remembered on this phone; first default is hidden. */
export function CountNotesDrawer({ notes, onNotes, open, onToggle }: { notes: Record<string, number>; onNotes: (n: Record<string, number>) => void; open: boolean; onToggle: () => void }) {
  return (
    <div className={s.notesDraw}>
      <button type="button" className={s.notesHead} aria-expanded={open} onClick={onToggle}>
        Count notes <Icon name="chevron" className={s.chev} />
      </button>
      {open ? <CountNotes notes={notes} onNotes={onNotes} heading={false} /> : null}
    </div>
  );
}
