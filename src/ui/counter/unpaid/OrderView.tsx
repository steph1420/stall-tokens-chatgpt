// F-55 s121 / s122 order view (P2), opened from the Unpaid tab. Layout from s121 (locked): "‹ Order", big token with
// Unpaid in red, who · status · age, the lines card, and the action bar. Unpaid: Take payment + yellow Complete
// (press and hold, Q-HOLD-RING A bar on top of the action bar). Paid: Refund in one tap (Undo toast), "Change lines,
// reason or note ›" for the Refund sheet, Reprint, and Complete.
import { CONFIG } from '../../../config';
import type { Order } from '../../../contract';
import { ago, bill, completed, formatToken, orderStatus, useApp } from '../../../store';
import { HoldBar } from '../../kit/HoldBar';
import { Icon } from '../../kit/Icon';
import { Money } from '../../kit/Money';
import k from '../../kit/kit.module.css';
import { useSecond } from '../TakeOver';
import s from './Unpaid.module.css';

export function OrderView({ orderId }: { orderId: string }) {
  const o = useApp((x) => x.folded.orders[orderId]);
  const back = useApp((x) => x.back);
  if (!o || o.deleted) return <main className={s.empty}><p><b>This order is gone</b></p><button type="button" className={k.quiet} onClick={() => { back(); }}>Back</button></main>;
  return <Body o={o} />;
}

function Lines({ o }: { o: Order }) {
  const due = bill.due(o);
  const paid = bill.held(o);
  return (
    <ul className={s.lines}>
      {o.lines.filter((l) => l.qty > 0).map((l) => <li key={l.lineId}><span>{`${String(l.qty)} × ${l.name}`}</span><Money p={bill.lineAmount(l)} /></li>)}
      <li className={s.tot}><span>Total</span><Money p={bill.total(o)} /></li>
      {paid > 0 && due > 0 ? <li><span>Paid so far</span><Money p={paid} /></li> : null}
      {o.complete?.unpaid ? <li className={s.note}><span>Completed without payment · the amount is on record</span></li> : null}
      {o.cancel ? <li className={s.note}><span>{`Cancelled${o.cancel.reason ? ` · ${o.cancel.reason}` : ''}`}</span></li> : null}
    </ul>
  );
}

/** Paid extras under the lines (s122): Refund in one tap, the Refund sheet, Reprint. */
function Extras({ o }: { o: Order }) {
  const r = useApp((x) => x.refund);
  const sheet = useApp((x) => x.openSheet);
  return (
    <div className={s.acts}>
      {bill.held(o) > 0 ? (
        <>
          <button type="button" className={k.danger} onClick={() => { r.quick(o.id); }}>Refund</button>
          <button type="button" className={s.link} onClick={() => { sheet({ kind: 'refundSheet', orderId: o.id }); }}>Change lines, reason or note ›</button>
        </>
      ) : null}
      <button type="button" className={k.quiet} onClick={() => { sheet({ kind: 'slip', orderId: o.id }); }}>Reprint token</button>
    </div>
  );
}

function Dock({ o }: { o: Order }) {
  const a = useApp((x) => x.open);
  const due = bill.due(o);
  const open = o.sent && !completed(o) && !o.cancel;
  const pay = due > 0 && !o.cancel ? <button type="button" className={k.quiet} onClick={() => { a.takePayment(o.id); }}>Take payment</button> : null;
  if (open && due > 0) return <HoldBar label="Complete" holdText="Marking as complete" onConfirm={() => { a.completeUnpaid(o.id); }} onHint={() => { a.complete(o.id); }}>{pay}</HoldBar>;
  if (!pay && !open) return null;
  return (
    <footer className={s.dock}>
      {pay}
      {open ? <button type="button" className={k.cta} onClick={() => { a.complete(o.id); }}>Complete</button> : null}
    </footer>
  );
}

function Body({ o }: { o: Order }) {
  const back = useApp((x) => x.back);
  const now = useSecond();
  const due = bill.due(o);
  const meta = [o.client, `${orderStatus(o, undefined)} · ${ago(o.createdAt, now)}`].filter(Boolean).join(' · ');
  return (
    <>
      <main className={s.view} aria-label={`Order ${formatToken(o.token, CONFIG.tokens.pad)}`}>
        <div className={s.vTop}>
          <button type="button" className={s.vBack} aria-label="Back" onClick={() => { back(); }}><Icon name="chevLeft" /></button>
          <b>Order</b>
        </div>
        <div className={s.vHead}>
          <span className={s.vTok}>{formatToken(o.token, CONFIG.tokens.pad)}</span>
          {due > 0 ? <span className={s.vDue}>Unpaid <Money p={due} /></span> : <span className={s.vPaid}>{completed(o) ? 'Complete' : 'Paid'}</span>}
        </div>
        <p className={s.vMeta}>{meta}</p>
        <Lines o={o} />
        {o.note ? <p className={s.vNote}>{o.note}</p> : null}
        <Extras o={o} />
      </main>
      <Dock o={o} />
    </>
  );
}
