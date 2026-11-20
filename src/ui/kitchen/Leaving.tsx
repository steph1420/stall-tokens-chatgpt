// F-19 / F-21 Q-OVERLAY + PK-10: an order that leaves the Kitchen/Station list keeps its card for a moment under a calm
// veil, then drops off: Completed (every line handed over), Cancelled (by the Counter), or, on a station, Handed over
// (done here, still open at other stations; the quiet veil, W-37). View-only memory: nothing is written to the log.
// W-29 PK-4: "leaving" is worked out in the same render the order leaves (no effect delay), so the card under the
// finger is already inert on its first frame and a second tap can't land on the next order.
import { useEffect, useState, type ReactNode } from 'react';
import { CONFIG } from '../../config';
import type { Order } from '../../contract';
import { kitchen } from '../../store';
import { PopIn } from '../../motion';
import { Icon } from '../kit/Icon';
import s from './Kitchen.module.css';

export type Why = kitchen.LeaveWhy;
export interface Gone { readonly o: Order; readonly why: Why; readonly at: number; readonly until: number }

function leftNow(prev: readonly Order[], ids: ReadonlySet<string>, orders: Readonly<Record<string, Order>>, station: string | null, until: number): Gone[] {
  return prev.flatMap((o, at) => {
    if (ids.has(o.id)) return [];
    const why = kitchen.leaveWhy(orders[o.id], station);
    return why ? [{ o: orders[o.id] ?? o, why, at, until }] : [];
  });
}

/** Orders that just left `list`, kept for CONFIG.kitchen.veilMs with why they left (derived in render, W-29). */
export function useLeaving(list: readonly Order[], orders: Readonly<Record<string, Order>>, station: string | null = null): readonly Gone[] {
  const key = list.map((o) => o.id).join(',');
  const [prev, setPrev] = useState<{ key: string; list: readonly Order[] }>({ key, list });
  const [gone, setGone] = useState<readonly Gone[]>([]);
  const [tick, setTick] = useState(0);
  if (prev.key !== key) {
    const left = leftNow(prev.list, new Set(list.map((o) => o.id)), orders, station, Date.now() + CONFIG.kitchen.veilMs);
    setPrev({ key, list });
    if (left.length) setGone((g) => [...g.filter((x) => !left.some((l) => l.o.id === x.o.id)), ...left]);
  }
  useEffect(() => {
    if (!gone.length) return undefined;
    const next = Math.min(...gone.map((g) => g.until));
    const t = window.setTimeout(() => { setGone((g) => g.filter((x) => x.until > Date.now())); setTick((n) => n + 1); }, Math.max(0, next - Date.now()));
    return () => { window.clearTimeout(t); };
  }, [gone, tick]);
  return gone.filter((g) => !list.some((o) => o.id === g.o.id));
}

/** Live orders with the leaving ones back at their old places. */
export function withGone<T extends { o: Order; gone?: Why }>(list: readonly Order[], gone: readonly Gone[]): T[] {
  const out = list.map((o) => ({ o }) as T);
  for (const g of [...gone].sort((a, b) => a.at - b.at)) out.splice(Math.min(g.at, out.length), 0, { o: g.o, gone: g.why } as T);
  return out;
}

const VEIL: Record<Why, { icon: 'check' | 'cross'; cls: string | undefined }> = {
  completed: { icon: 'check', cls: undefined }, cancelled: { icon: 'cross', cls: s.veilCancel }, handed: { icon: 'check', cls: s.veilHanded },
};
function veilText(why: Why, o: Order, station: string | null): string {
  if (why === 'completed') return 'Completed';
  if (why === 'cancelled') return 'Cancelled';
  const n = station ? kitchen.leftElsewhere(o, station) : 0;
  return n > 0 ? `Handed over · ${String(n)} left at other stations` : 'Handed over';
}

export function LeavingCard({ why, o, station = null, children }: { why: Why | undefined; o?: Order; station?: string | null; children: ReactNode }) {
  if (!why) return <>{children}</>;
  const v = VEIL[why];
  return (
    <div className={s.leaving} inert>
      {children}
      <div className={[s.veil, v.cls ?? ''].join(' ')} role="status">
        <PopIn className={s.veilBadge}>
          <span className={s.veilDot} aria-hidden="true"><Icon name={v.icon} className={s.veilIc} /></span>
          <span className={s.veilTx}>{o ? veilText(why, o, station) : why === 'cancelled' ? 'Cancelled' : 'Completed'}</span>
        </PopIn>
      </div>
    </div>
  );
}
