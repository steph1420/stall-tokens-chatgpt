// F-21 Station looks B (item cards) and C (kitchen ticket), Q-STN-LOOK D. Look A is the shared KitchenCard.
// PK-2 (W-25/W-38): every look carries the same header facts and the order note strip.
// Own lines use the same press owner as the card (tap = next status, hold = On hold); other stations' lines are muted.
import type { Line, Order } from '../../contract';
import { kitchen } from '../../store';
import { Facts, NoteStrip, PriorityToken, lineLabel, useLinePress } from '../kitchen/KitchenCard';
import { LineMark, StatusMark } from '../kitchen/StatusMark';
import { stationVar } from '../kitchen/stations';
import s from './Station.module.css';

function Others({ o, station }: { o: Order; station: string }) {
  const others = kitchen.linesAt(o, null).filter((l) => l.stationId !== station);
  if (!others.length) return null;
  return (
    <ul className={s.others} aria-label="Other stations">
      {others.map((l) => (
        <li key={l.lineId} style={stationVar(l.stationId)}><span>{`${String(l.qty)}× ${l.name}`}</span><LineMark l={l} small /></li>
      ))}
    </ul>
  );
}

function ItemCard({ o, l }: { o: Order; l: Line }) {
  const press = useLinePress(o, l);
  const cls = [s.icard, l.status === 'done?' ? s.icardDone : '', l.status === 'handed' || l.byCounter ? s.icardHanded : ''].join(' ');
  return (
    <div role="button" tabIndex={0} className={cls} style={stationVar(l.stationId)} {...press} aria-label={lineLabel(l)}>
      <span className={s.iqty}>{l.qty}</span>
      <span className={s.iname}>{l.name}</span>
      {l.note ? <span className={s.inote}>{l.note}</span> : null}
      <span className={s.istate}><LineMark l={l} /></span>
    </div>
  );
}

export function ItemCards({ o, station }: { o: Order; station: string }) {
  const own = kitchen.linesAt(o, station);
  return (
    <section className={s.look} aria-label="Item cards">
      <div className={s.lookH}><PriorityToken o={o} /><Facts o={o} />{o.priority ? <StatusMark mark="priority" /> : null}</div>
      <NoteStrip o={o} />
      <div className={s.igrid}>{own.map((l) => <ItemCard key={l.lineId} o={o} l={l} />)}</div>
      <Others o={o} station={station} />
    </section>
  );
}

function TicketRow({ o, l }: { o: Order; l: Line }) {
  const press = useLinePress(o, l);
  return (
    <li role="button" tabIndex={0} className={[s.trow, l.status === 'done?' ? s.trowDone : '', l.status === 'handed' ? s.icardHanded : ''].join(' ')} {...press} aria-label={lineLabel(l)}>
      <span className={s.tqty}>{l.qty}×</span>
      <span className={s.tname}>{l.name}{l.note ? <small>{l.note}</small> : null}</span>
      <LineMark l={l} />
    </li>
  );
}

export function Ticket({ o, station }: { o: Order; station: string }) {
  const own = kitchen.linesAt(o, station);
  return (
    <section className={s.ticket} aria-label="Kitchen ticket">
      <div className={s.tickH}><PriorityToken o={o} /><Facts o={o} />{o.priority ? <StatusMark mark="priority" /> : null}</div>
      <NoteStrip o={o} />
      <ul className={s.tlist}>{own.map((l) => <TicketRow key={l.lineId} o={o} l={l} />)}</ul>
      <Others o={o} station={station} />
    </section>
  );
}
