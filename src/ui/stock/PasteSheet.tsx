// F-31 Paste stock (21-polish2/stockpaste.html; Q-STOCK-SET, Q-PASTE-1 A): paste box, format hint, "Will add" preview
// (+qty unit, paid, discount, New item; unclear lines amber), Paid by, and one button: Add n · Spent ₹total.
// F-46 Q-SUPPLY-CONFIRM B (Steve 16 Nov 19:33 IST): each new thing asks "Menu" or "Stock only" before Add.
// F-68 W-23: "Tea 20pcs" with no price tops up a known item ("Count only · no Spent"); an unknown name needs a price.
import { useState } from 'react';
import { formatInr, type MoneyPart } from '../../contract';
import { kindKey, stock, useApp, type NewKinds } from '../../store';
import { Sheet } from '../kit/Sheet';
import { PaidBySheet, modeOf } from '../money/PaidBySheet';
import s from './Stock.module.css';

const MODE_LABEL = { register: '🧾 Register', upi: '📱 UPI', person: '👤 Personal', mixed: '🔀 Mixed' } as const;

function KindPick({ name, kinds, onKind }: { name: string; kinds: NewKinds; onKind: (k: NewKinds) => void }) {
  const cur = kinds[kindKey(name)];
  const opt = (v: 'menu' | 'stock', label: string) => (
    <button type="button" role="radio" aria-checked={cur === v} className={cur === v ? s.kindOn : s.kind} onClick={() => { onKind({ ...kinds, [kindKey(name)]: v }); }}>{label}</button>
  );
  return <span className={s.kinds} role="radiogroup" aria-label={`${name}: Menu or Stock only`}>{opt('menu', 'Menu')}{opt('stock', 'Stock only')}</span>;
}

function Preview({ lines, kinds, onKind }: { lines: readonly stock.PasteLine[]; kinds: NewKinds; onKind: (k: NewKinds) => void }) {
  const items = useApp((x) => Object.values(x.folded.items));
  return (
    <ul className={s.will} aria-label="Will add">
      {lines.map((l, i) => {
        const ok = stock.usable(l, items);
        const known = !!stock.matchItem(items, l.name);
        const why = l.ok && !l.priced ? 'New item · add the price paid' : 'Not clear · check name, qty and price';
        const detail = l.priced ? [`Paid ${formatInr(l.paid)}`, l.discount ? (l.discount.kind === 'pct' ? `${String(l.discount.value)}% discount` : `${formatInr(l.discount.value * 100)} discount`) : ''].filter(Boolean).join(' · ') : 'Count only · no Spent';
        return (
          <li key={`${String(i)}${l.raw}`} className={ok ? s.wl : s.wlBad}>
            <span className={s.wlMain}>
              <span className={s.wlName}>{ok ? l.name : l.raw}{ok && !known ? <em className={s.newTag}>New item</em> : null}</span>
              <small>{ok ? detail : why}</small>
            </span>
            {ok ? <b className={s.plus}>{`+${String(l.qty)}${l.unit ? ` ${l.unit}` : ''}`}</b> : null}
            {ok && !known ? <KindPick name={l.name} kinds={kinds} onKind={onKind} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PasteSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x.stock);
  const toast = useApp((x) => x.money.toast);
  const [text, setText] = useState('');
  const [parts, setParts] = useState<MoneyPart[]>([{ source: 'register', personId: null, amount: 0 }]);
  const [paidBy, setPaidBy] = useState(false);
  const [kinds, setKinds] = useState<NewKinds>({});
  const known = useApp((x) => Object.values(x.folded.items));
  const lines = stock.parsePaste(text);
  const ok = lines.filter((l) => stock.usable(l, known));
  const undecided = ok.filter((l) => !stock.matchItem(known, l.name) && !kinds[kindKey(l.name)]).length;
  const total = stock.pasteTotal(lines, known);
  const fit = parts.length === 1 ? parts.map((p) => ({ ...p, amount: total })) : parts;
  const pasteIn = () => { void navigator.clipboard.readText().then((t) => { setText(t); }, () => { toast('Paste into the box with a long press'); }); };
  const save = () => { const err = a.paste(lines, fit, kinds); if (err) toast(err); else { toast(`Added ${String(ok.length)} to stock`); onClose(); } };
  return (
    <Sheet label="Paste stock" onClose={onClose}>
      <div className={s.pHead}><b>Paste stock</b><button type="button" className={s.pBtn} onClick={pasteIn}>📋 Paste</button></div>
      <textarea spellCheck={false} className={s.box} aria-label="Pasted stock" rows={4} value={text} placeholder={'Straw - 2 pcs - 100 - 20\nCups 60off 6pkt 450rs'} onChange={(e) => { setText(e.target.value); }} />
      <p className={s.hint}>Name - qty - price paid - discount. Labels like 2pcs, 60off, 10%, 100rs work in any order.</p>
      {lines.length ? <><p className={s.willH}>Will add</p><Preview lines={lines} kinds={kinds} onKind={setKinds} /></> : null}
      <button type="button" className={s.paidBy} onClick={() => { setPaidBy(true); }}><span>Paid by</span><b>{`${MODE_LABEL[modeOf(parts)]} ›`}</b></button>
      <button type="button" className={s.addGo} disabled={!ok.length || undecided > 0} onClick={save}>{undecided ? `Choose Menu or Stock only (${String(undecided)})` : ok.length ? `Add ${String(ok.length)}${total > 0 ? ` · Spent ${formatInr(total)}` : ''}` : 'Add'}</button>
      {paidBy ? <PaidBySheet title="Paid by" parts={fit} amount={total} onChange={setParts} onClose={() => { setPaidBy(false); }} /> : null}
    </Sheet>
  );
}
