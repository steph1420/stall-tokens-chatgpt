// Q-CANCEL-1 A Refunds due from cancelled orders: Cash back / UPI back. Shared by Money (F-25) and Close the day step 2 (F-66).
import { formatToken, money, useApp } from '../../store';
import { CONFIG } from '../../config';
import { Money } from '../kit/Money';
import { Section } from '../stall/StallPage';
import st from '../stall/Stall.module.css';

/** The rows only (Close the day puts them inside its step card). */
export function RefundRows({ dayId }: { dayId?: string }) {
  const orders = useApp((x) => x.folded.orders);
  const m = useApp((x) => x.money);
  const due = money.refundsDue(Object.values(orders).filter((o) => dayId === undefined || o.dayId === dayId));
  if (!due.length) return null;
  return (
    <>
      {due.map(({ order: o, due: d }) => (
        <div key={o.id} className={[st.row, st.wrap].join(' ')}>
          <span className={st.rowMain}><span className={st.rowT}>{`${formatToken(o.token, CONFIG.tokens.pad)} cancelled`}</span>
            <span className={st.rowS}>{o.cancel?.reason || 'No reason given'}</span></span>
          <Money p={d} className={[st.amt, st.warn].join(' ')} />
          <span className={st.acts}>
            <button type="button" className={st.small} onClick={() => { m.refundCancelled(o.id, 'cash'); }}>Cash back</button>
            <button type="button" className={st.small} onClick={() => { m.refundCancelled(o.id, 'upi'); }}>UPI back</button>
          </span>
        </div>
      ))}
    </>
  );
}

export function RefundsDue() {
  const n = useApp((x) => money.refundsDue(Object.values(x.folded.orders)).length);
  return n ? <Section label="Refunds due"><RefundRows /></Section> : null;
}
