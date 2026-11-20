// F-28 Person sheet (21-polish2/settlesheet.html, clearnote.html): amount (partial ok), Via / When tiles, Mark cleared + Pay;
// Mark cleared asks a reason (Gifted / Paid directly / Written off / Shared cost) + optional note. History with Undo.
import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatInr, parseRupees, type ClearReason, type MoneySource } from '../../contract';
import { istClock, settle, useApp } from '../../store';
import { Icon } from '../kit/Icon';
import { remindLater, shareText } from '../kit/share';
import { Sheet } from '../kit/Sheet';
import kit from '../kit/kit.module.css';
import s from './Settle.module.css';

const REASONS: readonly { id: ClearReason; icon: string; label: string }[] = [
  { id: 'gifted', icon: '🎁', label: 'Gifted' }, { id: 'paid-directly', icon: '🤝', label: 'Paid directly' },
  { id: 'written-off', icon: '✍️', label: 'Written off' }, { id: 'shared-cost', icon: '➗', label: 'Shared cost' },
];
const R = CONFIG.money.paisePerRupee;

function ClearNote({ name, amount, onDone, onCancel }: { name: string; amount: number; onDone: (r: ClearReason, note: string) => void; onCancel: () => void }) {
  const [r, setR] = useState<ClearReason>('gifted');
  const [note, setNote] = useState('');
  return (
    <Sheet title={`Mark ${formatInr(Math.abs(amount))} cleared?`} onClose={onCancel}>
      <p className={s.sub}>{amount > 0 ? `${name} won't be paid back · nothing recorded in money` : `${name} won't pay it back · nothing recorded in money`}</p>
      <div className={s.reasons} role="radiogroup" aria-label="Reason">
        {REASONS.map((x) => <button type="button" role="radio" key={x.id} aria-checked={r === x.id} className={r === x.id ? s.reasonOn : s.reason} onClick={() => { setR(x.id); }}><span aria-hidden="true">{x.icon}</span> {x.label}</button>)}
      </div>
      <input className={kit.input} placeholder="Add a note (optional)" aria-label="Note" value={note} maxLength={CONFIG.limits.noteMaxChars} onChange={(e) => { setNote(e.target.value); }} />
      <div className={s.two}><button type="button" className={kit.quiet} onClick={onCancel}>Cancel</button><button type="button" className={s.clearGo} onClick={() => { onDone(r, note); }}>Mark cleared</button></div>
    </Sheet>
  );
}

function History({ personId }: { personId: string }) {
  const xs = useApp((x) => x.folded.settlements.filter((y) => y.personId === personId));
  const a = useApp((x) => x.settle);
  if (!xs.length) return null;
  return (
    <ul className={s.hist} aria-label="History">
      {[...xs].reverse().map((x) => (
        <li key={x.id} className={x.undone ? s.histUndone : undefined}>
          <span>{`${istClock(x.at)} · ${x.kind === 'pay' ? 'Paid' : 'Marked cleared'} ${formatInr(Math.abs(x.amount))}${x.undone ? ' · undone' : ''}`}</span>
          {x.undone ? null : <button type="button" className={s.undo} onClick={() => { a.undo(x.id); }}>Undo</button>}
        </li>
      ))}
    </ul>
  );
}

/** F-47 reminders: send a nudge through the phone's share sheet, or a local reminder on this phone in an hour. */
function Remind({ name, bal }: { name: string; bal: number }) {
  const stall = useApp((x) => x.folded.settings.stallName ?? 'the stall');
  const toast = useApp((x) => x.money.toast);
  if (bal === 0) return null;
  const msg = bal > 0 ? `Hi ${name}, ${stall} owes you ${formatInr(bal)}. We'll settle it soon.` : `Hi ${name}, a reminder: ${formatInr(-bal)} of ${stall} money is with you. Please hand it back when you can.`;
  const nudge = () => { void shareText('Reminder', msg).then((r) => { if (r !== 'shared') toast(r === 'copied' ? 'Reminder copied' : 'Could not share'); }); };
  const later = () => { void remindLater('Settle up', `${name} · ${formatInr(Math.abs(bal))}`, CONFIG.timings.remindLaterMs).then((ok) => { toast(ok ? 'Reminder set for 1 hour' : 'Notifications are off on this phone'); }); };
  return (
    <div className={s.two}>
      <button type="button" className={kit.quiet} onClick={nudge}>Send reminder</button>
      <button type="button" className={kit.quiet} onClick={later}>Remind me in 1 h</button>
    </div>
  );
}

export function PersonSheet({ personId, onClose }: { personId: string; onClose: () => void }) {
  const f = useApp((x) => x.folded);
  const a = useApp((x) => x.settle);
  const p = f.people[personId];
  const bal = settle.balances(f)[personId] ?? 0;
  const partners = Object.values(f.people).filter((x) => x.isPartner && x.id !== personId);
  const vias: readonly { via: MoneySource; by: string | null; label: string }[] = [{ via: 'register', by: null, label: '💵 Register' }, { via: 'upi', by: null, label: '📱 UPI' }, ...partners.map((x) => ({ via: 'person' as const, by: x.id, label: `👤 ${x.name}` }))];
  const [vi, setVi] = useState(0);
  const [text, setText] = useState(String(Math.abs(bal) / R));
  const [clearing, setClearing] = useState(false);
  if (!p) return null;
  const why = settle.balanceWhy(f, personId);
  const amt = (parseRupees(text) ?? 0) * Math.sign(bal);
  const v = vias[vi % vias.length] ?? vias[0];
  const pay = () => { if (v && a.pay(personId, amt, v.via, v.by)) onClose(); };
  return (
    <div className={s.person} role="dialog" aria-label={p.name}>
      <div className={s.ptop}><button type="button" className={s.x} aria-label="Close" onClick={onClose}><Icon name="cross" /></button><b>{p.name}</b><span /></div>
      <div className={s.pav}>{p.name.slice(0, 1).toUpperCase()}</div>
      <p className={s.sub}>{bal === 0 ? 'All settled' : `${why.labels.join(', ') || 'Balance'} · ${String(why.count)} ${why.count === 1 ? 'entry' : 'entries'}${bal < 0 ? ' · holds stall money' : ''}`}</p>
      <label className={s.big}><span className={s.rs}>₹</span><input aria-label="Amount" inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); }} /></label>
      <div className={s.tiles}>
        <button type="button" className={s.tile} onClick={() => { setVi(vi + 1); }}><small>Via</small><b>{v?.label}</b></button>
        <div className={s.tile}><small>When</small><b>Today</b></div>
      </div>
      <Remind name={p.name} bal={bal} />
      <History personId={personId} />
      <div className={s.foot}>
        <p className={s.hint}>Mark cleared clears the debt · no payment recorded</p>
        <div className={s.two}>
          <button type="button" className={s.clearBtn} disabled={bal === 0} onClick={() => { setClearing(true); }}>Mark cleared</button>
          <button type="button" className={s.payBtn} disabled={amt === 0} onClick={pay}>{bal < 0 ? `Take back ${formatInr(Math.abs(amt))}` : `Pay ${formatInr(Math.abs(amt))}`}</button>
        </div>
      </div>
      {clearing ? <ClearNote name={p.name} amount={bal} onCancel={() => { setClearing(false); }} onDone={(r, n) => { if (a.clear(personId, r, n)) onClose(); }} /> : null}
    </div>
  );
}
