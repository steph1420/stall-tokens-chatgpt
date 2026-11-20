// F-64 History (Q-HISTORY-1 A, FEATURES §17; 21-polish2/history.html look): one screen, Orders · Money. Per day, newest first.
// Orders lists every sent order (W-08) with its padded token (W-18) and one plain tag (Unpaid / Paid / Refunded / Refund due /
// Cancelled / Written off; W-21), plus "Edited". Search by token, name or item when the shared History search switch is on
// (FEATURES §0.2, on by default; Q-P4-EXTRAS-ON A). Each day header has Notes › (F-67). Money keeps the entries list (Spent / Received, Hold to void).
import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatInr, type Entry, type Order } from '../../contract';
import { bill, closing, extraOn, formatToken, history, istClock, useApp } from '../../store';
import { Money } from '../kit/Money';
import { DayNotesSheet } from './DayNotesSheet';
import { EntrySheet, OrderHistorySheet } from './HistorySheets';
import { StallPage } from './StallPage';
import s from './Stall.module.css';

type Seg = 'orders' | 'money';
const TONE = { ok: s.tagOk, warn: s.tagW, danger: s.tagR, info: s.tagI } as const;
const items = (o: Order) => o.lines.filter((l) => l.qty > 0).map((l) => (l.qty > 1 ? `${l.name} ×${String(l.qty)}` : l.name)).join(', ');

function OrderRow({ o, onPick }: { o: Order; onPick: () => void }) {
  const tag = history.historyTag(o);
  return (
    <button type="button" className={[s.hrow, o.cancel ? s.hdim : ''].join(' ')} onClick={onPick}>
      <span className={s.rowMain}>
        <span className={s.hT}><span>{formatToken(o.token, CONFIG.tokens.pad)}</span><em className={TONE[tag.tone]}>{tag.text}</em>{o.revision > 0 ? <em className={s.tagI}>Edited</em> : null}</span>
        <span className={s.rowS}>{`${istClock(history.rowAt(o))} · ${items(o) || 'No items'}`}</span>
      </span>
      <Money p={bill.total(o)} className={o.cancel ? s.hAmtQ : s.hAmt} />
    </button>
  );
}

function EntryRow({ e, who, onPick }: { e: Entry; who: string; onPick: () => void }) {
  return (
    <button type="button" className={[s.hrow, e.voided !== null ? s.hdim : ''].join(' ')} onClick={onPick}>
      <span className={s.rowMain}><span className={s.hT}>{e.label}{e.voided !== null ? <em className={s.tagR}>Voided</em> : null}</span><span className={s.rowS}>{`${istClock(e.at)} · ${who}`}</span></span>
      <span className={e.dir === 'spent' ? s.hNeg : s.hAmt}>{`${e.dir === 'spent' ? '−' : '+'}${formatInr(e.amount)}`}</span>
    </button>
  );
}

function DayHead({ dayId, title, onNotes }: { dayId: string; title: string; onNotes: () => void }) {
  const rec = closing.closeRecord(useApp((x) => x.folded.records.day_note?.[dayId]));
  const has = rec.text.trim() !== '' || rec.tags.length > 0;
  return (
    <div className={s.hdayRow}>
      <h2 className={s.hdayH}>{title}</h2>
      <button type="button" className={s.hNotes} aria-label={`Notes for ${title}`} onClick={onNotes}>{has ? 'Notes ✓ ›' : 'Notes ›'}</button>
    </div>
  );
}

export function HistoryScreen() {
  const f = useApp((x) => x.folded);
  const searchOn = extraOn(f.settings, 'historySearch');
  const [seg, setSeg] = useState<Seg>('orders');
  const [q, setQ] = useState('');
  const [pickO, setPickO] = useState<string | null>(null);
  const [pickE, setPickE] = useState<Entry | null>(null);
  const [notes, setNotes] = useState<{ id: string; title: string } | null>(null);
  const who = (e: Entry) => { const p = e.parts.find((x) => x.source === 'person'); return e.parts.length > 1 ? 'Mixed' : p ? `Paid by ${f.people[p.personId ?? '']?.name ?? 'someone'}` : e.parts[0]?.source === 'upi' ? 'UPI' : 'Register'; };
  const today = f.days[f.days.length - 1]?.id;
  const all = Object.values(f.orders);
  const query = searchOn ? q : '';
  const days = [...f.days].reverse().map((d) => ({
    d, title: d.id === today ? 'Today' : d.label,
    orders: history.historyOrders(all, d.id).filter((o) => history.matchOrder(o, query)).sort((a, b) => history.rowAt(b) - history.rowAt(a)),
    entries: f.entries.filter((e) => e.dayId === d.id).sort((a, b) => b.at - a.at),
  }));
  const shown = days.filter((x) => (seg === 'orders' ? x.orders.length : x.entries.length) > 0);
  const segBtn = (v: Seg, label: string) => <button type="button" role="tab" aria-selected={seg === v} className={seg === v ? s.hSegOn : s.hSegBtn} onClick={() => { setSeg(v); }}>{label}</button>;
  const empty = query.trim() ? 'No order matches that.' : seg === 'orders' ? 'Nothing yet today. Orders show here once they go to the kitchen.' : 'Nothing spent or received yet.';
  return (
    <StallPage title="History">
      <div className={s.hSeg} role="tablist" aria-label="Show">{segBtn('orders', 'Orders')}{segBtn('money', 'Money')}</div>
      {searchOn && seg === 'orders' ? <input className={s.hSearch} type="search" aria-label="Search orders" placeholder="Token, name or item" value={q} onChange={(e) => { setQ(e.target.value); }} /> : null}
      {shown.length === 0 ? <p className={s.empty}>{empty}</p> : null}
      {shown.map(({ d, title, orders, entries }) => (
        <section key={d.id} className={s.hday}>
          <DayHead dayId={d.id} title={title} onNotes={() => { setNotes({ id: d.id, title }); }} />
          {seg === 'orders'
            ? orders.map((o) => <OrderRow key={o.id} o={o} onPick={() => { setPickO(o.id); }} />)
            : entries.map((e) => <EntryRow key={e.id} e={e} who={who(e)} onPick={() => { setPickE(e); }} />)}
        </section>
      ))}
      {pickO && f.orders[pickO] ? <OrderHistorySheet o={f.orders[pickO]} onClose={() => { setPickO(null); }} /> : null}
      {pickE ? <EntrySheet e={pickE} onClose={() => { setPickE(null); }} /> : null}
      {notes ? <DayNotesSheet dayId={notes.id} title={notes.title} onClose={() => { setNotes(null); }} /> : null}
    </StallPage>
  );
}
