// F-55 s120 Unpaid tab (P2, Q-UNPAID-ROW B, locked): "₹X to collect", then one card of rows: token, who · items,
// status · age, the amount in red, a chevron. No buttons on the row; tap it for the order view (s121).
import { CONFIG } from '../../../config';
import type { Order } from '../../../contract';
import { ago, bill, formatToken, liveOrders, orderStatus, unpaidOrders, useApp } from '../../../store';
import { Icon } from '../../kit/Icon';
import { Money } from '../../kit/Money';
import { useSecond } from '../TakeOver';
import s from './Unpaid.module.css';

const count = (o: Order) => { const n = o.lines.reduce((t, l) => t + l.qty, 0); return `${String(n)} ${n === 1 ? 'item' : 'items'}`; };
const since = (ms: number, now: number) => ago(ms, now).replace(/ ago$/, '');

export function UnpaidScreen() {
  const folded = useApp((x) => x.folded);
  const open = useApp((x) => x.open);
  const now = useSecond();
  const list = unpaidOrders(liveOrders(folded)).sort((a, b) => a.createdAt - b.createdAt);
  const owed = list.reduce((t, o) => t + Math.max(0, bill.due(o)), 0);
  if (list.length === 0) return <main className={s.empty}><p><b>Nothing to collect</b></p><p>Every order is paid.</p></main>;
  return (
    <main className={s.page} aria-label="Unpaid orders">
      <div className={s.sum}><Money p={owed} className={s.sumAmt} /><span>to collect</span></div>
      <ul className={s.list}>
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" className={s.row} onClick={() => { open.viewOrder(o.id); }}>
              <span className={s.tok}>{formatToken(o.token, CONFIG.tokens.pad)}</span>
              <span className={s.mid}><b className={s.who}>{[o.client, count(o)].filter(Boolean).join(' · ')}</b><small>{`${orderStatus(o, undefined)} · ${since(o.createdAt, now)}`}</small></span>
              <Money p={bill.due(o)} className={s.amt} />
              <span className={s.chev}><Icon name="chevLeft" /></span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
