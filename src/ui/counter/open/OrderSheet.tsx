// F-43 Open Orders order sheet (tap the header; Q-ORDERS-6 A: Edit in Billing + Cancel order, Handover stays in the bar),
// and the all-stations Overview (item totals still to make + status split).
import { useState } from 'react';
import { CONFIG } from '../../../config';
import type { Order } from '../../../contract';
import { bill, istClock, kitchen, liveOrders, useApp } from '../../../store';
import { Money } from '../../kit/Money';
import { Sheet } from '../../kit/Sheet';
import { StatusMark, type Mark } from '../../kitchen/StatusMark';
import kit from '../../kit/kit.module.css';
import st from '../../station/Station.module.css';
import s from './Open.module.css';

function paidText(o: Order): string {
  const due = bill.due(o);
  if (due > 0) return 'to collect';
  const cash = o.payments.some((p) => p.cash > 0);
  const upi = o.payments.some((p) => p.upi > 0);
  return cash && upi ? 'paid cash + UPI' : upi ? 'paid UPI' : cash ? 'paid cash' : 'nothing to collect';
}

export function OrderSheet({ orderId }: { orderId: string }) {
  const o = useApp((x) => x.folded.orders[orderId]);
  return o && !o.cancel && !o.deleted ? <Body key={o.id} o={o} /> : null;
}

function Body({ o }: { o: Order }) {
  const close = useApp((x) => x.openSheet);
  const a = useApp((x) => x.open);
  const k = useApp((x) => x.kitchen);
  const r = useApp((x) => x.refund);
  const [name, setName] = useState(o.client);
  const tok = `#${String(o.token).padStart(CONFIG.tokens.pad, '0')}`;
  const meta = [o.client, istClock(o.createdAt), o.servedBy].filter(Boolean).join(' · ');
  const due = bill.due(o);
  return (
    <Sheet label={`Order ${tok}`} onClose={() => { close(null); }}>
      <div className={s.shH}><b>{tok}</b><span>{meta}</span></div>
      <label className={s.shRow}><span>Client name</span>
        <input className={s.shInput} value={name} placeholder="Add" maxLength={CONFIG.limits.nameMaxChars} aria-label="Client name"
          onChange={(e) => { setName(e.target.value); }} onBlur={() => { a.setClient(o.id, name); }} /></label>
      <div className={s.shRow}><span>Priority</span>
        <button type="button" role="switch" aria-checked={o.priority} aria-label="Priority" className={o.priority ? s.swOn : s.sw} onClick={() => { k.togglePriority(o.id); }}><i /></button></div>
      <ul className={s.shList}>
        {o.lines.filter((l) => l.qty > 0).map((l) => <li key={l.lineId}><span>{`${String(l.qty)}× ${l.name}`}</span><Money p={bill.lineAmount(l)} /></li>)}
        <li className={s.shTot}><span>{`Total · ${paidText(o)}`}</span><Money p={due > 0 ? due : bill.total(o)} /></li>
      </ul>
      <div className={s.shRow}><span>Note</span><span className={s.shFaint}>{o.note || '—'}</span></div>
      {bill.held(o) > 0 ? (
        // s122: Refund in one tap (whole, the way it was paid; Undo in the toast) or the full Refund sheet.
        <div className={s.shBtns}>
          <button type="button" className={kit.danger} onClick={() => { if (r.quick(o.id).ok) close(null); }}>Refund</button>
          <button type="button" className={kit.quiet} onClick={() => { close({ kind: 'refundSheet', orderId: o.id }); }}>Change lines, reason or note ›</button>
        </div>
      ) : null}
      {o.lines.some((l) => l.status === 'done?') ? (
        // W-31 PK-4: the kitchen said Done? too early: send it back to Preparing.
        <div className={s.shBtns}><button type="button" className={kit.quiet} onClick={() => { if (k.sendBack(o.id)) close(null); }}>Send back to the kitchen</button></div>
      ) : null}
      <div className={s.shBtns}>
        <button type="button" className={kit.quiet} onClick={() => { a.editInBilling(o.id); }}>Edit in Billing</button>
        <button type="button" className={kit.quiet} onClick={() => { close({ kind: 'slip', orderId: o.id }); }}>Print token</button>
        <button type="button" className={s.shCancel} onClick={() => { close({ kind: 'cancel', orderId: o.id }); }}>Cancel order</button>
      </div>
    </Sheet>
  );
}

const SPLIT = ['waiting', 'preparing', 'held', 'paused', 'done?', 'ready'] as const satisfies readonly Mark[];

export function OpenOverview() {
  const folded = useApp((x) => x.folded);
  const close = useApp((x) => x.openSheet);
  const ov = kitchen.overviewAll(liveOrders(folded));
  return (
    <Sheet title="All open orders" onClose={() => { close(null); }}>
      <div className={kit.fieldLab}>Still to make</div>
      <ul className={st.ovItems}>
        {ov.items.length === 0 ? <li className={st.ovNone}>Nothing waiting</li> : null}
        {ov.items.map((i) => <li key={i.name}><b>{i.qty}</b><span>{i.name}</span></li>)}
      </ul>
      <div className={st.ovSplit}>
        {SPLIT.filter((m) => (ov.split[m] ?? 0) > 0).map((m) => (
          <span key={m} className={st.ovChip}><StatusMark mark={m === 'done?' ? 'ready' : m} {...(m === 'done?' ? { text: 'Ready to confirm' } : {})} /><b>{ov.split[m]}</b></span>
        ))}
      </div>
    </Sheet>
  );
}
