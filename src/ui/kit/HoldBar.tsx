// P2 HoldBar (Q-HOLD-RING A, s121): the bottom action bar for an unpaid order. The yellow Complete is press-and-hold;
// while held, a wide bar fills left to right along the top edge of the action bar with "Marking as complete" above it
// (no ring on the button: the thumb would hide it). A short tap only hints; release early cancels; a buzz on finish.
import { useRef, useState, type ReactNode } from 'react';
import { HOLD } from '../../tokens/tokens';
import { useApp } from '../../store';
import { buzz } from './haptics';
import s from './kit.module.css';

export function HoldBar({ label, holdText, onConfirm, onHint, children }: {
  label: string; holdText: string; onConfirm: () => void; onHint: () => void; children?: ReactNode;
}) {
  const haptics = useApp((x) => x.prefs.haptics);
  const [holding, setHolding] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const begin = () => {
    done.current = false; setHolding(true);
    t.current = setTimeout(() => { done.current = true; setHolding(false); buzz(haptics, 'confirm'); onConfirm(); }, HOLD.durationMs);
  };
  const end = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
    if (holding && !done.current) onHint();
    setHolding(false);
  };
  return (
    <footer className={s.holdDock}>
      <div className={holding ? s.holdLabOn : s.holdLab} aria-hidden={!holding}>{holdText}</div>
      <div className={s.holdTrack} aria-hidden="true"><i className={holding ? s.holdRunOn : s.holdRun} /></div>
      <div className={s.holdBtns}>
        {children}
        <button type="button" className={s.holdWarn} aria-label={`${label} (hold)`}
          onPointerDown={begin} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} onContextMenu={(e) => { e.preventDefault(); }}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin(); } }}
          onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') end(); }}>{label}</button>
      </div>
    </footer>
  );
}
