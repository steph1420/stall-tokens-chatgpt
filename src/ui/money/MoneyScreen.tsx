// F-23..F-25 Money home (D-MONEY-HOME, Pos: no mockup; same list style as the Stall screens). Today: sales, spent, received,
// tips (own pot, D-MONEY), Refunds due from cancelled orders (Q-CANCEL-1 A), today's entries. Spent / Received open the entry.
// F-65 (P4, FEATURES §18): sales tiles are what came in (no silent drop when money goes back) with a separate Refunds tile;
// an Unpaid ₹X · n tile opens the Counter's Unpaid tab (W-08); a Written off tile (Q-WRITEOFF-SPLIT A, outside the split).
import { useState } from 'react';
import { formatInr } from '../../contract';
import { istClock, liveOrders, money, useApp } from '../../store';
import { Money } from '../kit/Money';
import { Section, StallPage } from '../stall/StallPage';
import st from '../stall/Stall.module.css';
import { MoneyEntry } from './MoneyEntry';
import { RefundsDue } from './RefundsDue';
import { ReceiptButton, useReceiptIds } from './Receipt';
import s from './Money.module.css';

function Entries({ dayId }: { dayId: string }) {
  const entries = useApp((x) => x.folded.entries.filter((e) => e.dayId === dayId));
  const people = useApp((x) => x.folded.people);
  const [photos, bump] = useReceiptIds();
  const by = (e: (typeof entries)[number]) => e.parts.map((p) => (p.source === 'person' ? people[p.personId ?? '']?.name ?? 'Someone' : p.source === 'upi' ? 'UPI' : 'Register')).join(' + ');
  return (
    <Section label="Today">
      {entries.length === 0 ? <div className={st.empty}>Nothing spent or received yet.</div> : null}
      {[...entries].reverse().map((e) => (
        <div key={e.id} className={[st.row, e.voided ? st.muted : ''].join(' ')}>
          <span className={st.rowMain}><span className={st.rowT}>{e.label}{e.kind === 'donation' ? ' · donation' : ''}</span>
            <span className={st.rowS}>{`${istClock(e.at)} · ${e.dir === 'spent' ? 'paid by' : 'in'} ${by(e)}${e.voided ? ' · cancelled' : ''}`}</span></span>
          <span className={[st.amt, e.dir === 'spent' ? st.neg : st.pos].join(' ')}>{`${e.dir === 'spent' ? '−' : '+'}${formatInr(e.amount)}`}</span>
          {e.voided ? null : <ReceiptButton entryId={e.id} has={photos.has(e.id)} onChange={bump} />}
        </div>
      ))}
    </Section>
  );
}

function Tile({ label, p, tone, sign, onClick }: { label: string; p: number; tone?: string | undefined; sign?: '−'; onClick?: () => void }) {
  const body = <><span className={st.tileL}>{label}</span><Money p={p} sign={p ? sign : undefined} className={[st.tileV, tone ?? ''].join(' ')} /></>;
  return onClick ? <button type="button" className={st.tileGo} onClick={onClick}>{body}</button> : <div className={st.tile}>{body}</div>;
}

export function MoneyScreen() {
  const folded = useApp((x) => x.folded);
  const a = useApp((x) => x);
  const [entry, setEntry] = useState<'spent' | 'received' | null>(null);
  const dayId = folded.days[folded.days.length - 1]?.id ?? '';
  const d = money.dayMoney(liveOrders(folded), folded.entries, dayId);
  if (entry) return <MoneyEntry start={entry} onClose={() => { setEntry(null); }} />;
  return (
    <StallPage title="Money" bar={<>
      <button type="button" className={s.barSpent} onClick={() => { setEntry('spent'); }}>Spent</button>
      <button type="button" className={s.barRecv} onClick={() => { setEntry('received'); }}>Received</button></>}>
      <div className={st.tiles}>
        <Tile label="Sales · cash" p={d.cashSales} />
        <Tile label="Sales · UPI" p={d.upiSales} />
        <Tile label={`Unpaid · ${String(d.unpaid.n)} ›`} p={d.unpaid.amount} tone={d.unpaid.n ? st.warn : ''} onClick={() => { a.go('counter'); a.open.showTab('unpaid'); }} />
        <Tile label="Refunds" sign="−" p={d.refunds.cash + d.refunds.upi} tone={d.refunds.cash + d.refunds.upi ? st.neg : ''} />
        <Tile label="Spent" p={d.spent} />
        <Tile label={`Received${d.donations ? ` · incl. ${formatInr(d.donations)} donations` : ''}`} p={d.received} />
        <Tile label="Tips (own pot)" p={d.tips} />
        <Tile label="Waived" p={d.waived} />
        <Tile label={`Written off${d.writtenOff.n ? ` · ${String(d.writtenOff.n)}` : ''}`} p={d.writtenOff.amount} />
        <Tile label="Register by the book" p={d.registerFlow + Number(folded.settings[`float:${dayId}`] ?? 0)} />
      </div>
      <RefundsDue />
      <Entries dayId={dayId} />
    </StallPage>
  );
}
