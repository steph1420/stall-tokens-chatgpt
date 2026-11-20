// F-54 s127 take-over (locked 17 Nov 2026). s127a: the order is open on another phone: Take over / New order / Back, with
// an automatic check every 10 s and a big Check now (Steve pt9u). s127b: this phone's order was taken: view only, with
// its own Take over. While either shows, the order underneath cannot be changed (inert; the store refuses too).
import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { devKey, focusOf, formatToken, useApp } from '../../store';
import k from '../kit/kit.module.css';
import s from './TakeOver.module.css';

/** Re-render once a second so "last heard" and the countdown stay true (and the lease is judged again). */
export function useSecond(): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => { setT(Date.now()); }, 1000); return () => { clearInterval(i); }; }, []);
  return t;
}

const secs = (ms: number) => `${String(Math.max(0, Math.round(ms / 1000)))} s`;

/** What the Counter shows over the order on screen: nothing, waiting (s127a) or taken (s127b). */
export function useTakeOver(): { kind: 'none' } | { kind: 'wait' | 'taken'; orderId: string; label: string } {
  useSecond();
  const st = useApp((x) => x);
  const id = focusOf(st);
  if (!id) return { kind: 'none' };
  const h = st.handling.of(id);
  if (h.kind !== 'busy') return { kind: 'none' };
  if (st.handling.displaced(id)) return { kind: 'taken', orderId: id, label: h.label };
  return st.ui.waitFor === id ? { kind: 'wait', orderId: id, label: h.label } : { kind: 'none' };
}

function Heard({ orderId }: { orderId: string }) {
  const now = useSecond();
  const o = useApp((x) => x.folded.orders[orderId]);
  const heard = useApp((x) => (o?.handler ? x.heard[devKey(o.handler.deviceId)] : undefined));
  const next = useApp((x) => x.ui.nextCheckAt);
  const offline = useApp((x) => x.sync.error !== null);
  return (
    <>
      <p className={s.sub}>{heard ? `Last heard from it ${secs(now - heard)} ago` : 'Not heard from it yet'}</p>
      <p className={s.sub}>{next > now ? `Checking again in ${secs(next - now)}` : 'Checking…'}</p>
      {offline ? <p className={s.warn} role="note">This phone is offline, so it cannot check the other phone. Take over only if nobody is using it.</p> : null}
    </>
  );
}

export function TakeOverCard({ orderId, label }: { orderId: string; label: string }) {
  const tok = useApp((x) => { const o = x.folded.orders[orderId]; return o ? formatToken(o.token, CONFIG.tokens.pad) : ''; });
  const h = useApp((x) => x.handling);
  const c = useApp((x) => x.counter);
  return (
    <div className={s.wrap}>
      <section className={s.card} role="alertdialog" aria-labelledby="tk-title" aria-describedby="tk-sub">
        <h2 id="tk-title" className={s.title}>{`${tok} is open on ${label}`}</h2>
        <p id="tk-sub" className={s.lead}>{`This phone will bring it in by itself when ${label} is done with it.`}</p>
        <Heard orderId={orderId} />
        <button type="button" className={s.check} onClick={() => { h.checkNow(); }}>Check now</button>
        <div className={s.acts}>
          <button type="button" className={k.cta} onClick={() => { h.takeOver(orderId); }}>Take over</button>
          <button type="button" className={k.quiet} onClick={() => { h.leave(); c.newOrder(); }}>New order</button>
          <button type="button" className={k.quiet} onClick={() => { h.leave(); }}>Back</button>
        </div>
      </section>
    </div>
  );
}

export function TakenBanner({ orderId, label }: { orderId: string; label: string }) {
  const h = useApp((x) => x.handling);
  return (
    <div className={s.banner} role="status">
      <span><b>{`Taken over by ${label}`}</b><small>View only on this phone</small></span>
      <button type="button" className={s.bannerBtn} onClick={() => { h.takeOver(orderId); }}>Take over</button>
    </div>
  );
}
