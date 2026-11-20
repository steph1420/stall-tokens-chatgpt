// F-23 / F-25 Money entry (21-polish2/money.html v8, received.html; Q-MONEY-V8, Q-RECV, Q-VOUCH-1 Donation). Top tabs
// Spent | Received, then For / Paid by tiles (From / Received in), amount, keypad, Save. Red accent for Spent, green for Received.
import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatInr, type MoneyPart } from '../../contract';
import { useApp } from '../../store';
import { Icon } from '../kit/Icon';
import { KEYS, nextAmount, type Key } from '../kit/keypad';
import { Sheet } from '../kit/Sheet';
import kit from '../kit/kit.module.css';
import { modeOf, PaidBySheet, People } from './PaidBySheet';
import s from './Money.module.css';

type Dir = 'spent' | 'received';
const R = CONFIG.money.paisePerRupee;

function ForSheet({ dir, label, personId, onPick, onClose }: { dir: Dir; label: string; personId: string | null; onPick: (label: string, personId: string | null) => void; onClose: () => void }) {
  const recent = useApp((st) => [...new Set(st.folded.entries.filter((e) => e.dir === dir && !e.personId).map((e) => e.label).filter(Boolean))].slice(-8).reverse());
  const people = useApp((st) => st.folded.people);
  const [v, setV] = useState(personId ? '' : label);
  return (
    <Sheet title={dir === 'spent' ? 'For' : 'From'} onClose={onClose}>
      <input className={kit.input} aria-label={dir === 'spent' ? 'What it was for' : 'Who or what it came from'} value={v} maxLength={CONFIG.limits.nameMaxChars}
        placeholder={dir === 'spent' ? 'Ice, cups, gas…' : 'Fair organiser, sponsor…'} onChange={(e) => { setV(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') { onPick(v, null); onClose(); } }} />
      {recent.length ? <div className={s.chips}>{recent.map((r) => <button type="button" key={r} className={s.chip} onClick={() => { onPick(r, null); onClose(); }}>{r}</button>)}</div> : null}
      {dir === 'received' ? <><div className={kit.fieldLab}>Or a person (counts in their balance)</div>
        <People picked={personId} pick={(id) => { onPick(people[id]?.name ?? '', id); onClose(); }} /></> : null}
      <div className={kit.row}><span className={kit.grow} /><button type="button" className={kit.cta} onClick={() => { onPick(v, null); onClose(); }}>Done</button></div>
    </Sheet>
  );
}

function srcLabel(parts: readonly MoneyPart[], names: Readonly<Record<string, { name: string }>>): { icon: string; text: string } {
  const m = modeOf(parts);
  if (m === 'mixed') return { icon: '🔀', text: 'Mixed' };
  if (m === 'person') return { icon: '👤', text: names[parts[0]?.personId ?? '']?.name ?? 'Someone' };
  return m === 'upi' ? { icon: '📱', text: 'UPI' } : { icon: '🧾', text: 'Register' };
}

export function Keys({ onPress }: { onPress: (k: Key) => void }) {
  return (
    <div className={s.keys}>
      {KEYS.map((k) => <button type="button" key={k} className={s.key} aria-label={k === 'del' ? 'Delete' : k} onClick={() => { onPress(k); }}>{k === 'del' ? <Icon name="backspace" className={s.bs} /> : k}</button>)}
    </div>
  );
}

function Top({ dir, onDir, onClose }: { dir: Dir; onDir: (d: Dir) => void; onClose: () => void }) {
  return (
    <div className={s.etop}>
      <button type="button" className={s.x} aria-label="Close" onClick={onClose}><Icon name="cross" /></button>
      <div className={s.seg} role="tablist" aria-label="Kind">
        {(['spent', 'received'] as const).map((d) => <button type="button" role="tab" key={d} aria-selected={dir === d} className={dir === d ? s.segOn : s.segBtn} onClick={() => { onDir(d); }}>{d === 'spent' ? 'Spent' : 'Received'}</button>)}
      </div>
    </div>
  );
}

export function MoneyEntry({ start, onClose }: { start: Dir; onClose: () => void }) {
  const m = useApp((st) => st.money);
  const people = useApp((st) => st.folded.people);
  const [dir, setDir] = useState<Dir>(start);
  const [rupees, setRupees] = useState(0);
  const [fresh, setFresh] = useState(true);
  const [label, setLabel] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [parts, setParts] = useState<MoneyPart[]>([{ source: 'register', personId: null, amount: 0 }]);
  const [donation, setDonation] = useState(false);
  const [sheet, setSheet] = useState<'for' | 'src' | null>(null);
  const [err, setErr] = useState('');
  const amount = rupees * R;
  const live = parts.length === 1 ? parts.map((p) => ({ ...p, amount })) : parts;
  const press = (k: Key) => { const n = nextAmount(rupees, k, fresh); setFresh(false); if (n !== null) setRupees(n); };
  const save = () => {
    const e = m.addEntry({ dir, amount, label: label || (dir === 'spent' ? 'Spent' : 'Received'), kind: dir === 'received' && donation ? 'donation' : 'normal', parts: live, note: '', personId });
    if (e) { setErr(e); return; }
    m.toast(`${dir === 'spent' ? 'Spent' : 'Received'} ${formatInr(amount)} saved`);
    onClose();
  };
  const src = srcLabel(live, people);
  return (
    <div className={dir === 'spent' ? s.entrySpent : s.entryRecv}>
      <Top dir={dir} onDir={(d) => { setDir(d); setPersonId(null); }} onClose={onClose} />
      <div className={s.etiles}>
        <button type="button" className={s.etile} onClick={() => { setSheet('for'); }}><small>{dir === 'spent' ? 'For' : 'From'}</small><b>{label || 'Add'}</b><Icon name="next" className={s.chev} /></button>
        <button type="button" className={s.etile} onClick={() => { setSheet('src'); }}><small>{dir === 'spent' ? 'Paid by' : 'Received in'}</small><b><span aria-hidden="true">{src.icon}</span> {src.text}</b><Icon name="next" className={s.chev} /></button>
      </div>
      {dir === 'received' ? <button type="button" role="switch" aria-checked={donation} className={donation ? s.donOn : s.don} onClick={() => { setDonation(!donation); }}>Donation</button> : null}
      <div className={s.amount} aria-live="polite"><span className={s.rs}>₹</span>{rupees.toLocaleString('en-IN')}</div>
      {err ? <div className={kit.err} role="alert">{err}</div> : null}
      <Keys onPress={(k) => { press(k); setErr(''); }} />
      <button type="button" className={s.save} disabled={amount <= 0} onClick={save}>{`Save ${formatInr(amount)}`}</button>
      {sheet === 'for' ? <ForSheet dir={dir} label={label} personId={personId} onPick={(l, p) => { setLabel(l.trim()); setPersonId(p); }} onClose={() => { setSheet(null); }} /> : null}
      {sheet === 'src' ? <PaidBySheet title={dir === 'spent' ? 'Paid by' : 'Received in'} parts={live} amount={amount} onChange={setParts} onClose={() => { setSheet(null); }} /> : null}
    </div>
  );
}
