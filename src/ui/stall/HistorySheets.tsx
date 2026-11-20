// F-64 History sheets (FEATURES §17). Order: Take payment (when money is due), Edit, Refund (whenever money is held, W-10),
// Print token, Hold to cancel; a cancelled order that still holds money offers Cash back / UPI back (W-21). Entry: Hold to void.
import { CONFIG } from '../../config';
import { formatInr, type Entry, type Order } from '../../contract';
import { bill, formatToken, history, istClock, unpaid, useApp, type Sheet as CounterSheet } from '../../store';
import { HoldButton } from '../kit/HoldButton';
import { Sheet } from '../kit/Sheet';
import s from './Stall.module.css';

const TONE = { ok: s.tagOk, warn: s.tagW, danger: s.tagR, info: s.tagI } as const;

export function OrderHistorySheet({ o, onClose }: { o: Order; onClose: () => void }) {
  const a = useApp((x) => x);
  const tag = history.historyTag(o);
  const token = formatToken(o.token, CONFIG.tokens.pad);
  const toCounter = (sheet: CounterSheet | null) => { a.go('counter'); a.open.editInBilling(o.id); if (sheet) a.openSheet(sheet); };
  const hold = bill.held(o);
  return (
    <Sheet label={`Order ${token}`} onClose={onClose}>
      <p className={s.hsT}>{`Order ${token} · ${formatInr(bill.total(o))}`}</p>
      <p className={[s.hsTag, TONE[tag.tone]].join(' ')}>{tag.text}</p>
      <p className={s.hsS}>{o.lines.filter((l) => l.qty > 0).map((l) => (l.qty > 1 ? `${l.name} ×${String(l.qty)}` : l.name)).join(', ') || 'No items'}</p>
      {o.cancel ? (
        hold > 0 ? (
          <div className={s.hsRow}>
            <button type="button" className={s.hsBtn} onClick={() => { a.money.refundCancelled(o.id, 'cash'); }}>Cash back</button>
            <button type="button" className={s.hsBtn} onClick={() => { a.money.refundCancelled(o.id, 'upi'); }}>UPI back</button>
          </div>
        ) : <p className={s.hsS}>{`Cancelled${o.cancel.reason ? ` · ${o.cancel.reason}` : ''}`}</p>
      ) : (
        <>
          {unpaid(o) ? <button type="button" className={[s.goBig, s.hsGap].join(' ')} onClick={() => { a.go('counter'); a.open.takePayment(o.id); }}>{`Take payment · ${formatInr(bill.due(o))}`}</button> : null}
          <div className={s.hsRow}>
            <button type="button" className={s.hsBtn} onClick={() => { toCounter(null); }}>Edit</button>
            <button type="button" className={s.hsBtn} disabled={bill.held(o) <= 0} onClick={() => { toCounter({ kind: 'refundSheet', orderId: o.id }); }}>Refund</button>
          </div>
          <button type="button" className={[s.hsBtn, s.hsGap, s.wide].join(' ')} onClick={() => { a.go('counter'); a.openSheet({ kind: 'slip', orderId: o.id }); }}>Print token</button>
          <HoldButton label="Hold to cancel order" className={s.hsDanger} onConfirm={() => { a.counter.cancelOrder(o.id, 'From History'); onClose(); }}>Hold to cancel order</HoldButton>
        </>
      )}
    </Sheet>
  );
}

export function EntrySheet({ e, onClose }: { e: Entry; onClose: () => void }) {
  const m = useApp((x) => x.money);
  return (
    <Sheet label={e.label} onClose={onClose}>
      <p className={s.hsT}>{`${e.label} · ${formatInr(e.amount)}`}</p>
      <p className={s.hsS}>{`${e.dir === 'spent' ? 'Spent' : 'Received'} at ${istClock(e.at)}${e.note ? ` · ${e.note}` : ''}`}</p>
      {e.voided === null ? <HoldButton label="Hold to void entry" className={s.hsDanger} onConfirm={() => { m.voidEntry(e.id, 'From History'); onClose(); }}>Hold to void entry</HoldButton> : null}
    </Sheet>
  );
}
