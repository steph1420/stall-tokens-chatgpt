// F-24 Paid by / Received in sheet (21-polish2/paidby.html, paidby-mixed.html; Q-PAIDBY, Q-MIXED-1). Register, UPI,
// Personal (people list + Add a name), Mixed (one amount per source, bar "₹X of ₹total", green when covered).
import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatInr, parseRupees, type MoneyPart, type Paise } from '../../contract';
import { money, useApp } from '../../store';
import { Sheet } from '../kit/Sheet';
import s from './Money.module.css';

type Mode = 'register' | 'upi' | 'person' | 'mixed';
const OPTS: readonly { id: Mode; icon: string; name: string; hint: string }[] = [
  { id: 'register', icon: '🧾', name: 'Register', hint: 'From the stall till' },
  { id: 'upi', icon: '📱', name: 'UPI', hint: 'Stall UPI account' },
  { id: 'person', icon: '👤', name: 'Personal', hint: 'Someone paid from their own pocket' },
  { id: 'mixed', icon: '🔀', name: 'Mixed', hint: 'Split across more than one' },
];
const R = CONFIG.money.paisePerRupee;
export const modeOf = (parts: readonly MoneyPart[]): Mode => (parts.length > 1 ? 'mixed' : parts[0]?.source ?? 'register');

export function People({ pick, picked }: { pick: (id: string) => void; picked: string | null }) {
  const people = useApp((st) => Object.values(st.folded.people));
  const m = useApp((st) => st.money);
  const [name, setName] = useState('');
  const add = () => { const id = m.savePerson(null, name); if (id) { setName(''); pick(id); } };
  return (
    <ul className={s.people}>
      {people.map((p, i) => (
        <li key={p.id}><button type="button" className={s.person} aria-pressed={picked === p.id} onClick={() => { pick(p.id); }}>
          <span className={s.av} style={{ '--c': `var(--dl-stall-station-${String(i % 6)})` } as React.CSSProperties}>{p.name.slice(0, 1).toUpperCase()}</span>
          <span className={s.grow}>{p.name}</span>{picked === p.id ? <span className={s.tick}>✓</span> : null}</button></li>
      ))}
      <li className={s.person}><span className={s.avAdd}>+</span>
        <input className={s.addName} placeholder="Add a name…" aria-label="Add a name" value={name} maxLength={CONFIG.limits.nameMaxChars}
          onChange={(e) => { setName(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} onBlur={add} /></li>
    </ul>
  );
}

function Mixed({ parts, amount, onChange }: { parts: readonly MoneyPart[]; amount: Paise; onChange: (p: MoneyPart[]) => void }) {
  const people = useApp((st) => st.folded.people);
  const [adding, setAdding] = useState(false);
  const cov = money.coverage(parts, amount);
  const label = (p: MoneyPart) => (p.source === 'person' ? people[p.personId ?? '']?.name ?? 'Someone' : p.source === 'upi' ? 'UPI' : 'Register');
  const set = (i: number, text: string) => { const v = parseRupees(text) ?? 0; onChange(parts.map((p, j) => (j === i ? { ...p, amount: v } : p))); };
  const add = (p: MoneyPart) => { onChange([...parts, { ...p, amount: Math.max(0, cov.left) }]); setAdding(false); };
  return (
    <div className={s.mixed}>
      {parts.map((p, i) => (
        <div key={`${p.source}${p.personId ?? ''}`} className={s.part}>
          <span className={s.grow}>{label(p)}</span>
          <input className={s.partAmt} inputMode="decimal" aria-label={`${label(p)} amount`} value={p.amount ? String(p.amount / R) : ''} placeholder="₹0" onChange={(e) => { set(i, e.target.value); }} />
          <button type="button" className={s.partX} aria-label={`Remove ${label(p)}`} onClick={() => { onChange(parts.filter((_, j) => j !== i)); }}>×</button>
        </div>
      ))}
      {adding ? (
        <div className={s.addRow}>
          {!parts.some((p) => p.source === 'register') ? <button type="button" className={s.chip} onClick={() => { add({ source: 'register', personId: null, amount: 0 }); }}>Register</button> : null}
          {!parts.some((p) => p.source === 'upi') ? <button type="button" className={s.chip} onClick={() => { add({ source: 'upi', personId: null, amount: 0 }); }}>UPI</button> : null}
          <People picked={null} pick={(id) => { if (!parts.some((p) => p.personId === id)) add({ source: 'person', personId: id, amount: 0 }); }} />
        </div>
      ) : <button type="button" className={s.addAnother} onClick={() => { setAdding(true); }}>+ Add another</button>}
      <div className={cov.ok ? s.covOk : s.cov} role="status"><span>{`${formatInr(cov.got)} of ${formatInr(amount)}`}</span><b>{cov.ok ? 'All covered ✓' : cov.left > 0 ? `${formatInr(cov.left)} left` : `${formatInr(-cov.left)} too much`}</b></div>
    </div>
  );
}

export function PaidBySheet({ title, parts, amount, onChange, onClose }: { title: string; parts: readonly MoneyPart[]; amount: Paise; onChange: (p: MoneyPart[]) => void; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(modeOf(parts));
  const choose = (m: Mode) => {
    setMode(m);
    if (m === 'register' || m === 'upi') { onChange([{ source: m, personId: null, amount }]); onClose(); }
    if (m === 'mixed' && parts.length < 2) onChange(parts.filter((p) => p.source !== 'person' || p.personId).map((p) => ({ ...p, amount: p.amount || amount })));
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <div className={s.opts}>
        {OPTS.map((o) => (
          <div key={o.id}>
            <button type="button" className={mode === o.id ? s.optOn : s.opt} aria-pressed={mode === o.id} onClick={() => { choose(o.id); }}>
              <span className={s.optIc} aria-hidden="true">{o.icon}</span><span className={s.grow}><b>{o.name}</b><small>{o.hint}</small></span>{mode === o.id ? <span className={s.tick}>✓</span> : null}
            </button>
            {mode === 'person' && o.id === 'person' ? <People picked={parts.length === 1 ? parts[0]?.personId ?? null : null} pick={(id) => { onChange([{ source: 'person', personId: id, amount }]); onClose(); }} /> : null}
            {mode === 'mixed' && o.id === 'mixed' ? <Mixed parts={parts} amount={amount} onChange={onChange} /> : null}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
