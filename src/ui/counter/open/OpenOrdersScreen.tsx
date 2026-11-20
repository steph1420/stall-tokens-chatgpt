// F-43 Counter Open Orders (Q-ORDERS-1 rough v3, locked 16 Nov 18:21 IST; Q-ORDERS-3..6). Cyan band "Counter · All open orders"
// + Overview; ONE big squircle per order: header (number, client name row kept, time) swipe = previous / next, tap = order
// sheet; divider; Lines | Cards. Bottom bar: Cancel order + Handover. Interaction owner for this view (ARCHITECTURE §5.2).
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../../config';
import type { Line, Order } from '../../../contract';
import { ago, formatToken, istClock, kitchen, liveOrders, useApp } from '../../../store';
import { Icon } from '../../kit/Icon';
import { LeavingCard, useLeaving } from '../../kitchen/Leaving';
import { StatusMark, type Mark } from '../../kitchen/StatusMark';
import k from '../../kitchen/Kitchen.module.css';
import cs from '../Counter.module.css';
import { OpenOverview, OrderSheet } from './OrderSheet';
import s from './Open.module.css';

const ST: Record<Mark, string | undefined> = {
  waiting: k.stWaiting, preparing: k.stPreparing, 'done?': k.stReady, ready: k.stReady, held: k.stHeld, handed: k.stHanded, paused: k.stPaused, priority: k.stPriority,
};
const markOf = (l: Line): Mark => (l.status === 'draft' ? 'waiting' : l.status);
/** No "Done?" wording at the Counter (Q-ORDERS-1 v3): a station's proposed-done line reads "Ready". */
const textOf = (l: Line): string | undefined => (l.byCounter && l.status === 'ready' ? 'Marked by counter' : l.status === 'done?' ? 'Ready' : undefined);
const muted = (l: Line) => kitchen.lineMuted(l);
const canMark = (l: Line) => l.status !== 'handed' && l.status !== 'done?' && l.status !== 'ready';

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => { setNow(Date.now()); }, CONFIG.timings.clockTickMs); return () => { window.clearInterval(t); }; }, []);
  return now;
}

/** Header gesture owner: a horizontal swipe steps orders; a tap (no swipe) opens the order sheet. */
function useHeaderGesture(onStep: (d: 1 | -1) => void, onTap: () => void) {
  const p0 = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return {
    onPointerDown(e: React.PointerEvent) { p0.current = { x: e.clientX, y: e.clientY }; swiped.current = false; },
    onPointerUp(e: React.PointerEvent) {
      const p = p0.current; p0.current = null;
      if (!p) return;
      const dx = e.clientX - p.x;
      if (Math.abs(dx) >= CONFIG.gesture.swipePx && Math.abs(dx) > Math.abs(e.clientY - p.y)) { swiped.current = true; onStep(dx < 0 ? 1 : -1); }
    },
    onPointerCancel() { p0.current = null; },
    onClick() { if (!swiped.current) onTap(); swiped.current = false; },
  };
}

function Head({ o, index, count }: { o: Order; index: number; count: number }) {
  const a = useApp((st) => st.open);
  const openSheet = useApp((st) => st.openSheet);
  const now = useNow();
  const g = useHeaderGesture((d) => { a.stepOpen(d); }, () => { openSheet({ kind: 'orderSheet', orderId: o.id }); });
  const tok = String(o.token).padStart(CONFIG.tokens.pad, '0');
  return (
    <div className={s.head}>
      <button type="button" className={s.navL} aria-label="Previous order" disabled={index === 0} onClick={() => { a.stepOpen(-1); }}><Icon name="chevLeft" /></button>
      <button type="button" className={s.headTap} aria-label={`Order #${tok}, open order sheet`} {...g}>
        <span className={s.num}><span className={s.hash}>#</span>{tok}{o.priority ? <StatusMark mark="priority" label={false} small /> : null}</span>
        <span className={s.time}>{`${istClock(o.createdAt)} · ${ago(o.createdAt, now)}`}</span>
        <span className={s.client}>{o.client || '\u00a0'}</span>
        {count <= CONFIG.openDotsMax
          ? <span className={s.dots} aria-hidden="true">{Array.from({ length: count }, (_, i) => <i key={i} className={i === index ? s.dotOn : s.dot} />)}</span>
          : <span className={s.dotsTx}>{`${String(index + 1)} of ${String(count)}`}</span>}
      </button>
      <button type="button" className={s.navR} aria-label="Next order" disabled={index >= count - 1} onClick={() => { a.stepOpen(1); }}><Icon name="chevLeft" /></button>
    </div>
  );
}

function LineRow({ o, l }: { o: Order; l: Line }) {
  const a = useApp((st) => st.open);
  const kit = useApp((st) => st.kitchen);
  const cls = [s.line, l.status === 'done?' ? s.lineReady : '', muted(l) ? s.lineMuted : ''].join(' ');
  return (
    <li className={cls}>
      <button type="button" className={s.lineTap} aria-label={`${String(l.qty)}× ${l.name}: change status`} onClick={() => { a.tapLine(o.id, l.lineId); }}>
        <span className={s.lineName}>{`${String(l.qty)}× ${l.name}`}</span>
        <span className={s.lineSub}><StatusMark mark={l.status === 'done?' ? 'ready' : markOf(l)} small {...(textOf(l) ? { text: textOf(l) as string } : {})} />{l.note ? <span className={s.note}>{l.note}</span> : null}</span>
      </button>
      {l.status === 'done?' ? <button type="button" className={s.confirm} aria-label={`Confirm: ${l.name}`} onClick={() => { a.confirmLine(o.id, l.lineId); }}>Confirm</button>
        : canMark(l) ? <button type="button" className={s.mark} aria-label={`Mark ready: ${l.name}`} onClick={() => { kit.finishLine(o.id, l.lineId); }}>Mark ready</button> : null}
    </li>
  );
}

function Lines({ o }: { o: Order }) {
  const a = useApp((st) => st.open);
  const ls = kitchen.linesAt(o, null);
  const ready = ls.filter((l) => l.status === 'done?').length;
  return (
    <>
      <ul className={s.lines} aria-label="Lines">{ls.map((l) => <LineRow key={l.lineId} o={o} l={l} />)}</ul>
      {ready > 0 ? (
        <div className={s.all}><span>{`${String(ready)} ready`}</span><button type="button" className={s.confirmAll} onClick={() => { a.confirmAll(o.id); }}>Confirm all</button></div>
      ) : null}
    </>
  );
}

function Cards({ o }: { o: Order }) {
  const a = useApp((st) => st.open);
  return (
    <div className={s.cards} aria-label="Cards">
      {kitchen.linesAt(o, null).map((l) => (
        <button type="button" key={l.lineId} className={[s.card, ST[markOf(l)], muted(l) ? s.lineMuted : ''].join(' ')}
          aria-label={`${String(l.qty)}× ${l.name}: change status`} onClick={() => { a.tapLine(o.id, l.lineId); }}>
          <span className={s.cardName}>{`${String(l.qty)}× ${l.name}`}</span>
          <span className={s.cardSt}>{textOf(l) ?? (l.status === 'done?' ? 'Ready' : <StatusMark mark={markOf(l)} small />)}</span>
        </button>
      ))}
    </div>
  );
}

function BigCard({ o, index, count }: { o: Order; index: number; count: number }) {
  const look = useApp((st) => st.prefs.openLook);
  const setPrefs = useApp((st) => st.setPrefs);
  const openSheet = useApp((st) => st.openSheet);
  const kit = useApp((st) => st.kitchen);
  const tok = String(o.token).padStart(CONFIG.tokens.pad, '0');
  return (
    <article className={s.big} aria-label={`Order ${String(o.token)}`}>
      <Head o={o} index={index} count={count} />
      <div className={s.div} />
      <div className={s.lookRow}>
        <div className={s.lookLeft}>
          <button type="button" className={s.ov} onClick={() => { openSheet({ kind: 'openOverview' }); }}>Overview</button>
          <button
            type="button"
            className={o.priority ? s.prioBtnOn : s.prioBtn}
            onClick={() => { kit.togglePriority(o.id); }}
            aria-pressed={o.priority}
            aria-label={o.priority ? `Remove priority for #${tok}` : `Set priority for #${tok}`}
          >
            <StatusMark mark="priority" label={false} small />
            <span>{o.priority ? 'Priority on' : 'Priority'}</span>
          </button>
        </div>
        <div className={s.looks} role="radiogroup" aria-label="Look">
          {(['lines', 'cards'] as const).map((x) => (
            <button type="button" role="radio" key={x} aria-checked={look === x} className={look === x ? s.lookOn : s.look} onClick={() => { setPrefs({ openLook: x }); }}>{x === 'lines' ? 'Lines' : 'Cards'}</button>
          ))}
        </div>
      </div>
      {look === 'cards' ? <Cards o={o} /> : <Lines o={o} />}
    </article>
  );
}

/** P3b (D-P3B-2): on a tablet, every open order in a list beside the order card; tap a row to show it. */
function OpenList({ list, currentId }: { list: readonly Order[]; currentId: string | undefined }) {
  const a = useApp((st) => st.open);
  const now = useNow();
  if (list.length === 0) return <p className={s.empty}>No open orders.</p>;
  return (
    <ul className={s.olist} aria-label="Open orders">
      {list.map((o) => {
        const n = o.lines.reduce((t, l) => t + l.qty, 0);
        return (
          <li key={o.id}>
            <button type="button" className={o.id === currentId ? s.orowOn : s.orow} aria-current={o.id === currentId ? 'true' : undefined} onClick={() => { a.showOpen(o.id); }}>
              <span className={s.otok}>{formatToken(o.token, CONFIG.tokens.pad)}</span>
              <span className={s.omid}><b>{[o.client, `${String(n)} ${n === 1 ? 'item' : 'items'}`].filter(Boolean).join(' · ')}</b><small>{`${o.priority ? 'Priority · ' : ''}${ago(o.createdAt, now)}`}</small></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function OpenOrdersScreen({ wide = false }: { wide?: boolean }) {
  const folded = useApp((st) => st.folded);
  const openId = useApp((st) => st.ui.openId);
  const sheet = useApp((st) => st.ui.sheet);
  const a = useApp((st) => st.open);
  const openSheet = useApp((st) => st.openSheet);
  const list = kitchen.openOrders(liveOrders(folded));
  const i = Math.max(0, list.findIndex((x) => x.id === openId));
  const live = list[i];
  const gone = useLeaving(live ? [live] : [], folded.orders);
  const left = gone.find((g) => !live || g.o.id !== live.id);
  const o = left?.o ?? live;
  // W-09: a second tap inside the leaving-veil time is ignored, so a double tap never hands over the next order too.
  const lock = useRef(0);
  const handover = (id: string) => { const t = Date.now(); if (t < lock.current) return; lock.current = t + CONFIG.timings.tapLockMs; a.handOverAll(id); };
  const card = (
    <>
      <main className={s.body}>
        {o ? <div className={s.leaveR}><LeavingCard key={o.id} why={left?.why}><BigCard o={o} index={i} count={Math.max(list.length, 1)} /></LeavingCard></div>
          : <p className={s.empty}>No open orders. Orders sent to the kitchen show here.</p>}
      </main>
      {live && !left ? (
        <div className={s.bar}>
          <button type="button" className={s.cancel} onClick={() => { openSheet({ kind: 'cancel', orderId: live.id }); }}>Cancel order</button>
          <button type="button" className={s.handover} onClick={() => { handover(live.id); }}>Handover</button>
        </div>
      ) : null}
    </>
  );
  return (
    <>
      {wide ? <div className={cs.panes}><section className={cs.pane}><OpenList list={list} currentId={live?.id} /></section><section className={cs.paneR}>{card}</section></div> : card}
      {sheet?.kind === 'orderSheet' ? <OrderSheet orderId={sheet.orderId} /> : null}
      {sheet?.kind === 'openOverview' ? <OpenOverview /> : null}
    </>
  );
}
