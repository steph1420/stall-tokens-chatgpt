// F-55 F-56 P2 Counter sheets: Drafts (s123), the new-day question (W-22), the Refund sheet (s122 "Change lines, reason or
// note") and the token slip as a sheet so the phone's Back closes it (W-24).
import { useState } from 'react';
import { CONFIG } from '../../config';
import { parseRupees, type Order, type Paise, type PaySource } from '../../contract';
import { ago, bill, draftOrders, formatToken, liveOrders, useApp, type RefundAsk } from '../../store';
import { Money } from '../kit/Money';
import { Sheet } from '../kit/Sheet';
import k from '../kit/kit.module.css';
import { TokenSlipPrint } from '../slip/TokenSlip';
import { useSecond } from './TakeOver';
import s from './P2Sheets.module.css';

function useClose() { const o = useApp((x) => x.openSheet); return () => { o(null); }; }

/** s123: Discard needs a second tap on the same row (D-DRAFT-2). */
export function DraftsSheet() {
  const close = useClose();
  const folded = useApp((x) => x.folded);
  const a = useApp((x) => x.open);
  const c = useApp((x) => x.counter);
  const now = useSecond();
  const [arm, setArm] = useState<string | null>(null);
  const list = draftOrders(liveOrders(folded)).sort((p, q) => q.createdAt - p.createdAt);
  return (
    <Sheet title="Drafts" onClose={close}>
      {list.length === 0 ? <p className={s.none}>No drafts. Every order has gone to the kitchen or been paid.</p> : null}
      <ul className={s.list}>
        {list.map((o) => (
          <li key={o.id} className={s.row}>
            <button type="button" className={s.open} onClick={() => { c.selectOrder(o.id); c.setPage('menu'); close(); }}>
              <b>{formatToken(o.token, CONFIG.tokens.pad)}</b>
              <span>{o.lines.filter((l) => l.qty > 0).map((l) => `${String(l.qty)}× ${l.name}`).join(', ')}</span>
              <small>{`${o.device || o.servedBy || 'This phone'} · ${ago(o.createdAt, now)}`}</small>
            </button>
            <Money p={bill.total(o)} className={s.amt} />
            <button type="button" className={arm === o.id ? s.discardOn : s.discard} aria-label={`${arm === o.id ? 'Tap again to discard' : 'Discard'} ${formatToken(o.token, CONFIG.tokens.pad)}`} onClick={() => { if (arm === o.id) { a.discardDraft(o.id); setArm(null); } else setArm(o.id); }}>
              {arm === o.id ? 'Tap again' : 'Discard'}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** W-22: a new date while yesterday's day is still open. The tapped item (or new order) carries on after the answer. */
export function NewDaySheet() {
  const c = useApp((x) => x.counter);
  const close = useClose();
  const last = useApp((x) => x.folded.days[x.folded.days.length - 1]?.label ?? '');
  const go = (start: boolean) => { const item = c.answerDay(start); if (item) c.addItem(item); else c.newOrder(); };
  return (
    <Sheet title="A new day?" onClose={close}>
      <p className={s.lead}>{`Yesterday's day (${last}) is still open.`}</p>
      <div className={s.stack}>
        <button type="button" className={k.cta} onClick={() => { go(true); }}>Start today · tokens from #001</button>
        <button type="button" className={k.quiet} onClick={() => { go(false); }}>{"Keep yesterday's day"}</button>
      </div>
      <p className={s.hint}>Close yesterday later from Money. Nothing is lost either way.</p>
    </Sheet>
  );
}

type Mode = 'whole' | 'lines' | 'custom';
function useRefundForm(o: Order) {
  const [mode, setMode] = useState<Mode>('whole');
  const [pick, setPick] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [source, setSource] = useState<PaySource>(o.payments.reduce((t, p) => t + p.upi - p.cash, 0) > 0 ? 'upi' : 'cash');
  const [restock, setRestock] = useState(false);
  const ask = (): RefundAsk | string => {
    if (mode === 'whole') return { kind: 'whole' };
    if (mode === 'custom') { const p = parseRupees(amount); return p === null ? 'Type an amount' : { kind: 'custom', amount: p }; }
    return { kind: 'lines', lines: Object.entries(pick).filter(([, q]) => q > 0).map(([lineId, qty]) => ({ lineId, qty })) };
  };
  return { mode, setMode, pick, setPick, amount, setAmount, reason, setReason, note, setNote, source, setSource, restock, setRestock, ask };
}
type Form = ReturnType<typeof useRefundForm>;

function Choice<T extends string>({ value, set, opts, label }: { value: T; set: (v: T) => void; opts: readonly (readonly [T, string])[]; label: string }) {
  return (
    <div className={k.choiceRow} role="radiogroup" aria-label={label} style={{ '--n': opts.length } as React.CSSProperties}>
      {opts.map(([v, t]) => <button type="button" role="radio" aria-checked={value === v} key={v} className={value === v ? k.choiceOn : k.choice} onClick={() => { set(v); }}>{t}</button>)}
    </div>
  );
}

function PickLines({ o, f }: { o: Order; f: Form }) {
  return (
    <ul className={s.list}>
      {o.lines.filter((l) => l.qty > 0).map((l) => {
        const q = f.pick[l.lineId] ?? 0;
        const set = (n: number) => { f.setPick({ ...f.pick, [l.lineId]: Math.max(0, Math.min(l.qty, n)) }); };
        return (
          <li key={l.lineId} className={s.pick}>
            <span>{`${l.name} · ${String(l.qty)} ordered`}</span>
            <span className={s.step}>
              <button type="button" aria-label={`One less ${l.name}`} onClick={() => { set(q - 1); }}>−</button>
              <b>{q}</b>
              <button type="button" aria-label={`One more ${l.name}`} onClick={() => { set(q + 1); }}>+</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RefundForm({ o }: { o: Order }) {
  const close = useClose();
  const r = useApp((x) => x.refund);
  const f = useRefundForm(o);
  const [err, setErr] = useState('');
  const go = () => {
    const ask = f.ask();
    if (typeof ask === 'string') { setErr(ask); return; }
    const why = [f.reason, f.note.trim()].filter(Boolean).join(' · ');
    const res = r.offer({ orderId: o.id, ask, source: f.source, reason: why, restock: f.restock });
    if (res.ok) close(); else setErr(res.reason);
  };
  return (
    <Sheet title={`Refund ${formatToken(o.token, CONFIG.tokens.pad)}`} onClose={close}>
      <p className={s.lead}>Paid <Money p={bill.held(o)} /></p>
      <Choice label="What to refund" value={f.mode} set={f.setMode} opts={[['whole', 'Whole order'], ['lines', 'Some items'], ['custom', 'An amount']]} />
      {f.mode === 'lines' ? <PickLines o={o} f={f} /> : null}
      {f.mode === 'custom' ? <input className={k.input} inputMode="decimal" aria-label="Amount in rupees" placeholder="₹" value={f.amount} onChange={(e) => { f.setAmount(e.target.value); }} /> : null}
      <div className={k.fieldLab}>Reason</div>
      <div className={s.chips}>{CONFIG.refundReasons.map((t) => <button type="button" key={t} aria-pressed={f.reason === t} className={f.reason === t ? s.chipOn : s.chip} onClick={() => { f.setReason(f.reason === t ? '' : t); }}>{t}</button>)}</div>
      <input className={k.input} aria-label="Note" placeholder="Note (optional)" maxLength={CONFIG.limits.noteMaxChars} value={f.note} onChange={(e) => { f.setNote(e.target.value); }} />
      <Choice label="Give back as" value={f.source} set={f.setSource} opts={[['cash', 'Cash'], ['upi', 'UPI']]} />
      {f.mode === 'lines' ? <label className={s.check}><input type="checkbox" checked={f.restock} onChange={(e) => { f.setRestock(e.target.checked); }} />Put the items back in stock</label> : null}
      {err ? <p className={k.err} role="alert">{err}</p> : null}
      <button type="button" className={[k.danger, s.full].join(' ')} onClick={go}>Refund</button>
    </Sheet>
  );
}

export function RefundLinesSheet({ orderId }: { orderId: string }) {
  const o = useApp((x) => x.folded.orders[orderId]);
  return o && !o.deleted ? <RefundForm o={o} /> : null;
}

export function SlipSheet({ orderId, tip, waived }: { orderId: string; tip?: Paise | undefined; waived?: Paise | undefined }) {
  const o = useApp((x) => x.folded.orders[orderId]);
  const close = useClose();
  return o ? <TokenSlipPrint o={o} tip={tip} waived={waived} onDone={close} /> : null;
}
