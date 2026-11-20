// F-19 / F-21 / F-22 / F-58 One order card (21-polish2/kitchen.html, station.html "Full card"; s124 colour dot per line).
// Tap a line = next status, hold a line = On hold (hold on Done? = back to Preparing); hold the token = Priority.
// PK-2 header: token, age (amber / red), who, Unpaid, and the order note strip (allergy words in the warning tone).
// Handed-over lines stay, muted (Q-KITCHEN-4 A). On a station, its own lines come first (W-42).
import { CONFIG } from '../../config';
import type { Line, Order } from '../../contract';
import { bill, formatToken, kitchen, useApp } from '../../store';
import { buzz } from '../kit/haptics';
import { usePress } from '../kit/hold';
import { LineMark, StatusMark } from './StatusMark';
import { stationVar } from './stations';
import { useClock } from './useClock';
import s from './Kitchen.module.css';

export function Token({ o, className }: { o: Order; className?: string | undefined }) {
  const t = formatToken(o.token, CONFIG.tokens.pad).replace('#', '');
  return <span className={className ?? s.token}><span className={s.hash}>#</span>{t}</span>;
}

/** The one press owner for a station's own line: tap = next status, hold = On hold. */
export function useLinePress(o: Order, l: Line) {
  const k = useApp((st) => st.kitchen);
  return usePress(() => { k.advance(o.id, l.lineId); }, () => { k.toggleHold(o.id, l.lineId); });
}
export const lineLabel = (l: Line): string => `${l.name}: tap for the next step, hold for On hold`;

const AGE = { calm: s.age, amber: [s.age, s.ageAmber].join(' '), red: [s.age, s.ageRed].join(' ') } as const;

/** PK-2: age, who and Unpaid (all looks). */
export function Facts({ o }: { o: Order }) {
  const now = useClock();
  const tone = kitchen.ageTone(o.createdAt, now, CONFIG.kitchen.ageAmberMin, CONFIG.kitchen.ageRedMin);
  return (
    <span className={s.facts}>
      <span className={AGE[tone]}>{kitchen.ageText(o.createdAt, now)}</span>
      {o.client ? <span className={s.who}>{o.client}</span> : null}
      {bill.due(o) > 0 ? <span className={s.unpaid}>Unpaid</span> : null}
    </span>
  );
}
/** W-25: the order note reaches every kitchen look; allergy / diet words show as a warning. */
export function NoteStrip({ o }: { o: Order }) {
  if (!o.note.trim()) return null;
  const warn = kitchen.isWarningNote(o.note, CONFIG.kitchen.allergyWords);
  return <p className={warn ? [s.noteStrip, s.noteWarn].join(' ') : s.noteStrip} role={warn ? 'note' : undefined}>{o.note}</p>;
}
/** Hold the token for Priority (≥ 44 px target); W-40 says so with a toast and a buzz. */
export function PriorityToken({ o }: { o: Order }) {
  const k = useApp((st) => st.kitchen);
  const haptics = useApp((st) => st.prefs.haptics);
  const hold = usePress(() => undefined, () => { if (k.togglePriority(o.id)) buzz(haptics, 'confirm'); });
  return <span role="button" tabIndex={0} className={s.tokHold} {...hold} aria-label={o.priority ? 'Hold to turn Priority off' : 'Hold to mark Priority'}><Token o={o} /></span>;
}

function LineRow({ o, l, other, chip }: { o: Order; l: Line; other: boolean; chip: boolean }) {
  const press = useLinePress(o, l);
  const cls = [s.kline, l.status === 'handed' ? s.isHanded : '', l.status === 'done?' ? s.isDone : '', other ? s.isOther : '', l.byCounter && l.status === 'ready' ? s.isCounter : ''].join(' ');
  const body = (
    <>
      <span className={s.bar} />
      <span className={s.main}>
        <span className={s.name}>{`${String(l.qty)}× ${l.name}`}</span>
        {l.note ? <span className={s.note}>{l.note}</span> : null}
        {chip ? <span className={s.chip}>{l.stationId}</span> : null}
      </span>
      <span className={s.state}><LineMark l={l} /></span>
    </>
  );
  if (other) return <div className={cls} style={stationVar(l.stationId)}>{body}</div>;
  return <div role="button" tabIndex={0} className={cls} style={stationVar(l.stationId)} {...press} aria-label={lineLabel(l)}>{body}</div>;
}

/** `station` = the station this screen works for (other lines muted); `only` = show just that station's lines.
 * `hint` shows the quiet "Hold # for Priority" cue (first card only); `fresh` = the silent new-ticket glow. */
export function KitchenCard({ o, station, only, hint = false, fresh = false }: { o: Order; station: string | null; only: boolean; hint?: boolean; fresh?: boolean }) {
  const lines = kitchen.ownFirst(kitchen.linesAt(o, only ? station : null), station);
  const meta = kitchen.handedMeta(o);
  const paused = kitchen.isPaused(o, station);
  const cls = [s.kcard, o.priority ? s.isPriority : '', paused ? s.isPaused : '', fresh ? s.isNew : ''].join(' ');
  return (
    <article className={cls} aria-label={`Order ${formatToken(o.token, CONFIG.tokens.pad)}`}>
      <div className={s.kh}>
        <PriorityToken o={o} />
        <Facts o={o} />
        <span className={s.meta}>
          {o.priority ? <StatusMark mark="priority" /> : paused ? <StatusMark mark="paused" /> : meta ?? (hint ? <span className={s.hint}>Hold # for Priority</span> : null)}
        </span>
      </div>
      <NoteStrip o={o} />
      {lines.map((l) => <LineRow key={l.lineId} o={o} l={l} other={station !== null && l.stationId !== station} chip={station === null} />)}
    </article>
  );
}
