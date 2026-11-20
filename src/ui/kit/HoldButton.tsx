// HoldToConfirm (kit) for destructive actions: hold for HOLD.durationMs; a short tap only hints.
import { useRef, useState, type ReactNode } from 'react';
import { HOLD } from '../../tokens/tokens';
import s from './kit.module.css';

export function HoldButton({ onConfirm, onHint, className, children, label, disabled }: {
  onConfirm: () => void; onHint?: () => void; className?: string | undefined; children: ReactNode; label: string; disabled?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const begin = () => {
    if (disabled) return;
    done.current = false;
    setHolding(true);
    t.current = setTimeout(() => { done.current = true; setHolding(false); onConfirm(); }, HOLD.durationMs);
  };
  const end = () => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
    if (holding && !done.current) onHint?.();
    setHolding(false);
  };
  return (
    <button type="button" aria-label={`${label} (hold)`} disabled={disabled} className={[className, s.hold, holding ? s.holding : undefined].filter(Boolean).join(' ')}
      onPointerDown={begin} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} onContextMenu={(e) => { e.preventDefault(); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin(); } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') end(); }}>
      <span className={s.holdFill} aria-hidden="true" />
      {children}
    </button>
  );
}
