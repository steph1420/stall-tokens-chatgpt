// F-32 Open the stall (21-polish2/float.html): × close, sync pill, "Cash in the register to start", big amount on a keypad,
// "Last fair closed with ₹…" (last day's register by the book) and Start day. Float is setting `float:<dayId>`.
import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatInr } from '../../contract';
import { liveOrders, money, useApp } from '../../store';
import { Icon } from '../kit/Icon';
import { nextAmount } from '../kit/keypad';
import { Keys } from '../money/MoneyEntry';
import s from './Stall.module.css';

const R = CONFIG.money.paisePerRupee;

function useLastClose(): number | null {
  const f = useApp((x) => x.folded);
  const last = f.days[f.days.length - 1];
  if (!last) return null;
  const d = money.dayMoney(liveOrders(f), f.entries, last.id);
  return Number(f.settings[`float:${last.id}`] ?? 0) + d.registerFlow;
}

export function FloatScreen() {
  const close = useApp((x) => x.closeStall);
  const a = useApp((x) => x.money);
  const sync = useApp((x) => x.sync);
  const last = useLastClose();
  const [rupees, setRupees] = useState(Math.max(0, Math.round((last ?? 0) / R)));
  const [fresh, setFresh] = useState(true);
  const start = () => { a.openStall(rupees * R); a.toast(`Day started with ${formatInr(rupees * R)} in the register`); close(); };
  return (
    <div className={s.page}>
      <header className={s.floatTop}>
        <button type="button" className={s.back} aria-label="Close" onClick={close}><Icon name="cross" /></button>
        {sync.pending > 0 || !sync.online ? <span className={s.syncPill}><span className={s.pillDot} />{`${sync.online ? 'Online' : 'Offline'}${sync.pending ? ` · ${String(sync.pending)} waiting to sync` : ''}`}</span> : null}
      </header>
      <main className={s.body}>
        <h1 className={s.floatH}>Open the stall</h1>
        <p className={s.floatSub}>Cash in the register to start</p>
        <p className={s.floatAmt} aria-live="polite"><span className={s.floatRs}>₹</span>{rupees.toLocaleString('en-IN')}</p>
        {last !== null ? <p className={s.floatLast}>{`Last fair closed with ${formatInr(Math.max(0, last))}`}</p> : null}
        <Keys onPress={(k) => { const n = nextAmount(rupees, k, fresh); setFresh(false); if (n !== null) setRupees(n); }} />
      </main>
      <div className={s.bar}><button type="button" className={s.goBig} onClick={start}>Start day</button></div>
    </div>
  );
}
