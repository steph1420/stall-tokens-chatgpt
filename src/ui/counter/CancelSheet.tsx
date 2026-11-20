// F-20 Q-CANCEL-1 A: Cancel order confirm sheet (from Open Orders' bar or the order sheet). Optional reason; paid money is
// recorded as refund due, which Money settles (F-23).
import { useState } from 'react';
import { CONFIG } from '../../config';
import type { Order } from '../../contract';
import { bill, formatToken, useApp } from '../../store';
import { HoldButton } from '../kit/HoldButton';
import { Money } from '../kit/Money';
import { Sheet } from '../kit/Sheet';
import kit from '../kit/kit.module.css';
import s from './Counter.module.css';

/** Q-CANCEL-1 A: confirm sheet with an optional reason. Paid money is recorded as refund due (Money settles it later). */
export function CancelSheet() {
  const o = useApp((st) => (st.ui.sheet?.kind === 'cancel' ? st.folded.orders[st.ui.sheet.orderId] : undefined));
  return o ? <CancelBody key={o.id} o={o} /> : null;
}

function CancelBody({ o }: { o: Order }) {
  const close = useApp((st) => st.openSheet);
  const c = useApp((st) => st.counter);
  const [reason, setReason] = useState('');
  const paid = bill.held(o);
  return (
    <Sheet title={`Cancel ${formatToken(o.token, CONFIG.tokens.pad)}?`} onClose={() => { close(null); }}>
      <p className={kit.hint}>Kitchen and stations show it as Cancelled, then it drops off. Lines not started go back to stock.</p>
      {paid > 0 ? <p className={s.refundNote}><Money p={paid} /> paid · recorded as refund due for Money</p> : null}
      <label className={kit.field}>
        <span className={kit.fieldLab}>Reason (optional)</span>
        <input className={kit.input} value={reason} maxLength={CONFIG.limits.noteMaxChars} onChange={(e) => { setReason(e.target.value); }} />
      </label>
      <div className={kit.row}>
        <button type="button" className={[kit.quiet, kit.grow].join(' ')} onClick={() => { close(null); }}>Keep order</button>
        {paid > 0 ? (
          // W-21: cancelling a paid order is press-and-hold (money is involved); unpaid stays one tap.
          <HoldButton className={[kit.danger, kit.grow].join(' ')} label="Cancel order" onConfirm={() => { c.cancelOrder(o.id, reason); close(null); }}
            onHint={() => { c.toast('Press and hold to cancel a paid order'); }}>Hold to cancel</HoldButton>
        ) : <button type="button" className={[kit.danger, kit.grow].join(' ')} onClick={() => { c.cancelOrder(o.id, reason); close(null); }}>Cancel order</button>}
      </div>
    </Sheet>
  );
}
