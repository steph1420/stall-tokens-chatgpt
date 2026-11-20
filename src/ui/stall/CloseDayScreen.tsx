// F-66 Close the day (FEATURES §21, Pos top-4 gap behind the shared "Close the day" switch, on by default; Q-P4-EXTRAS-ON A). No locked mockup:
// built in the Stall list style (D-P4-CLOSE). Five steps: 1 Unpaid, 2 Refunds due, 3 Cash in the box (count notes vs the book),
// 4 Day notes, 5 Lock the day; then the Day summary. Steps 1-3 can be left for later with one tap (D-P4-SKIP).
import { useState, type ReactNode } from 'react';
import { CONFIG } from '../../config';
import { formatInr } from '../../contract';
import { bill, closing, formatToken, istDay, liveOrders, money, unpaidOrders, useApp } from '../../store';
import { HoldButton } from '../kit/HoldButton';
import { Money } from '../kit/Money';
import { CountNotes } from '../counter/payment/parts';
import { RefundRows } from '../money/RefundsDue';
import { DayNotesSheet } from './DayNotesSheet';
import { DaySummary } from './DaySummary';
import { StallPage } from './StallPage';
import s from './Stall.module.css';

type Skippable = (typeof closing.SKIPPABLE)[number];
const STATE_WORD = { done: 'Done', todo: '', skipped: 'Left for later' } as const;

function Step({ n, title, state, children, skip, onSkip }: { n: number; title: string; state: closing.StepState; children: ReactNode; skip?: boolean; onSkip?: (on: boolean) => void }) {
  return (
    <section className={s.sec} aria-label={`Step ${String(n)}: ${title}`}>
      <div className={s.stepH}>
        <span className={state === 'done' ? s.markDone : state === 'skipped' ? s.markSkip : s.mark} aria-hidden="true">{state === 'done' ? '✓' : n}</span>
        <span className={s.stepT}>{title}</span>
        <span className={state === 'skipped' ? s.warn : s.pos}>{STATE_WORD[state]}</span>
      </div>
      <div className={s.card}>
        <div className={s.stepBody}>{children}</div>
        {skip && onSkip && state !== 'done' ? (
          <button type="button" className={s.skipBtn} onClick={() => { onSkip(state !== 'skipped'); }}>{state === 'skipped' ? 'Bring it back' : 'Leave for later'}</button>
        ) : null}
      </div>
    </section>
  );
}

function UnpaidStep() {
  const a = useApp((x) => x);
  const os = unpaidOrders(liveOrders(a.folded));
  const today = a.folded.days[a.folded.days.length - 1]?.id;
  const open = (id?: string) => { a.go('counter'); a.open.showTab('unpaid'); if (id) a.open.viewOrder(id); };
  if (!os.length) return <p className={s.stepNote}>Nothing unpaid.</p>;
  return (
    <>
      <p className={s.stepNote}>{`${String(os.length)} unpaid · ${formatInr(os.reduce((t, o) => t + bill.due(o), 0))} to collect`}</p>
      {os.map((o) => (
        <button key={o.id} type="button" className={s.row} onClick={() => { open(o.id); }}>
          <span className={s.rowMain}><span className={s.rowT}>{formatToken(o.token, CONFIG.tokens.pad)}</span>
            <span className={s.rowS}>{o.dayId === today ? 'Today' : istDay(o.createdAt)}</span></span>
          <Money p={bill.due(o)} className={[s.amt, s.warn].join(' ')} />
        </button>
      ))}
      <button type="button" className={s.small} onClick={() => { open(); }}>Open Unpaid</button>
    </>
  );
}

function CashStep({ dayId, counted }: { dayId: string; counted: number | null }) {
  const f = useApp((x) => x.folded);
  const c = useApp((x) => x.close);
  const [notes, setNotes] = useState<Record<string, number>>({});
  const live = Object.entries(notes).reduce((t, [d, n]) => t + Number(d) * 100 * n, 0);
  const book = Number(f.settings[`float:${dayId}`] ?? 0) + money.dayMoney(liveOrders(f), f.entries, dayId).registerFlow;
  const check = closing.cashCheck(counted !== null && live === 0 ? counted : live, book);
  return (
    <>
      <div className={s.cashRow}><span>By the book</span><Money p={book} className={s.amt} /></div>
      <p className={s.stepHint}>Float + cash sales − cash spent − cash given back</p>
      {counted === null || live > 0 ? <CountNotes notes={notes} onNotes={setNotes} /> : null}
      <div className={s.cashRow}><span>{counted !== null && live === 0 ? 'Counted' : 'Counting'}</span><Money p={counted !== null && live === 0 ? counted : live} className={s.amt} /></div>
      {counted !== null || live > 0 ? <p className={[s.cashDiff, check.tone === 'ok' ? s.pos : s.warn].join(' ')} role="status">{check.text}</p> : null}
      {live > 0 ? <button type="button" className={s.goBig} onClick={() => { c.setCounted(dayId, live); setNotes({}); }}>{`Save count · ${formatInr(live)}`}</button> : null}
      {counted !== null && live === 0 ? <button type="button" className={s.small} onClick={() => { c.setCounted(dayId, null); }}>Count again</button> : null}
    </>
  );
}

function LockStep({ dayId, locked }: { dayId: string; locked: boolean }) {
  const a = useApp((x) => x);
  const partners = Object.values(a.folded.people).some((p) => p.isPartner);
  if (locked) return <p className={s.stepNote}>Day locked. Reopen it in Settle up to change money.</p>;
  return (
    <>
      <p className={s.stepNote}>{partners ? 'Check the partner split, then lock.' : 'Locking stops changes to today\'s money. Orders still work.'}</p>
      {partners ? <button type="button" className={s.small} onClick={() => { a.openStall('settle'); }}>Settle up ›</button> : null}
      <HoldButton label="Hold to lock the day" className={s.lockBtn} onConfirm={() => { if (a.close.lockDay(dayId)) a.money.toast('Day locked'); }}>Hold to lock the day</HoldButton>
    </>
  );
}

export function CloseDayScreen() {
  const f = useApp((x) => x.folded);
  const a = useApp((x) => x);
  const [notes, setNotes] = useState(false);
  const day = f.days[f.days.length - 1];
  if (!day) return <StallPage title="Close the day"><p className={s.empty}>No day started yet. Open the stall first.</p></StallPage>;
  const rec = closing.closeRecord(f.records.day_note?.[day.id]);
  const st = closing.closeSteps({ orders: liveOrders(f), dayId: day.id, rec, locks: f.locks });
  const skip = (k: Skippable) => (on: boolean) => { a.close.skip(day.id, k, on); };
  return (
    <StallPage title="Close the day">
      <p className={s.stepLead}>{`${day.label} · go down the list, then share the summary.`}</p>
      <Step n={1} title="Unpaid orders" state={st.unpaid} skip onSkip={skip('unpaid')}><UnpaidStep /></Step>
      <Step n={2} title="Refunds due" state={st.refunds} skip onSkip={skip('refunds')}>
        {st.refunds === 'done' ? <p className={s.stepNote}>No refunds due.</p> : <RefundRows dayId={day.id} />}
      </Step>
      <Step n={3} title="Cash in the box" state={st.cash} skip onSkip={skip('cash')}><CashStep dayId={day.id} counted={rec.counted} /></Step>
      <Step n={4} title="Day notes" state={st.notes}>
        <p className={s.stepNote}>{[rec.tags.join(', '), rec.text].filter(Boolean).join(' · ') || 'Anything to remember about today?'}</p>
        <button type="button" className={s.small} onClick={() => { setNotes(true); }}>{st.notes === 'done' ? 'Edit notes' : 'Add notes'}</button>
      </Step>
      <Step n={5} title="Lock the day" state={st.lock}><LockStep dayId={day.id} locked={st.lock === 'done'} /></Step>
      <DaySummary dayId={day.id} />
      {notes ? <DayNotesSheet dayId={day.id} title="Today" onClose={() => { setNotes(false); }} /> : null}
    </StallPage>
  );
}
