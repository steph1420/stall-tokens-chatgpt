// Calm toast and the storage banner (ARCHITECTURE §4 step 3).
import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { useApp } from '../../store';
import s from './kit.module.css';

/** A toast with a button (s127 "Open", s122 "Undo", P3 kitchen Undo) stays longer (its own ms, else CONFIG.handling.actionToastMs). */
export function Toast() {
  const toast = useApp((st) => st.ui.toast);
  const handling = useApp((st) => st.handling);
  const refund = useApp((st) => st.refund);
  const kitchen = useApp((st) => st.kitchen);
  const counter = useApp((st) => st.counter);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return undefined;
    setShown(toast.id);
    const t = setTimeout(() => { setShown(null); }, toast.ms ?? (toast.action ? CONFIG.handling.actionToastMs : CONFIG.timings.toastMs));
    return () => { clearTimeout(t); };
  }, [toast]);
  if (!toast || shown !== toast.id) return null;
  const a = toast.action;
  const run = () => {
    setShown(null);
    if (a?.run === 'open') handling.open(a.orderId);
    else if (a?.run === 'undoRefund') refund.undo(a.orderId, a.refundId);
    else if (a?.run === 'undoStep') kitchen.undoStep(a.orderId, a.lineId, a.status, a.from);
    else if (a?.run === 'undoPriority') kitchen.undoPriority(a.orderId, a.on);
    else if (a?.run === 'undoPay') counter.undoAdjust(a.orderId, a.tip, a.waived);
  };
  return (
    <div className={a ? s.toastAct : s.toast} role="status">
      <span>{toast.text}</span>
      {a ? <button type="button" className={s.toastBtn} onClick={run}>{a.label}</button> : null}
    </div>
  );
}

export function SaveBanner() {
  const err = useApp((st) => st.saveError);
  const retry = useApp((st) => st.retrySave);
  if (!err) return null;
  return (
    <div className={s.banner} role="alert">
      <span>{err} Your last changes are kept on screen; free some space, then retry.</span>
      <button type="button" className={s.bannerBtn} onClick={retry}>Retry</button>
    </div>
  );
}

/** IndexedDB fallback: calm, not blocking; the app keeps working in this tab. */
export function MemoryBanner() {
  const on = useApp((st) => st.memoryOnly);
  const [hidden, setHidden] = useState(false);
  if (!on || hidden) return null;
  return (
    <div className={s.banner} role="status">
      <span>This browser cannot keep orders after it closes. Keep this tab open, or use a normal (not private) window.</span>
      <button type="button" className={s.bannerBtn} onClick={() => { setHidden(true); }}>OK</button>
    </div>
  );
}
