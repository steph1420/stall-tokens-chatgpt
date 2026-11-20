// Press-and-hold and hold-to-confirm (kit). One owner of the pointer timing; HOLD comes from motion tokens.
import { useRef } from 'react';
import { CONFIG } from '../../config';
import { HOLD } from '../../tokens/tokens';

const MOVE_CANCEL = CONFIG.gesture.moveCancelPx; // finger travel that turns a press into a scroll

export function usePress(onTap: () => void, onHold: (() => void) | null, holdMs: number = HOLD.durationMs) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number; held: boolean } | null>(null);
  const clear = () => { if (t.current) clearTimeout(t.current); t.current = null; };
  return {
    onPointerDown(e: React.PointerEvent) {
      start.current = { x: e.clientX, y: e.clientY, held: false };
      if (onHold) t.current = setTimeout(() => { if (start.current) start.current.held = true; onHold(); }, holdMs);
    },
    onPointerMove(e: React.PointerEvent) {
      const st = start.current;
      if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > MOVE_CANCEL) { clear(); start.current = null; }
    },
    onPointerUp() { const st = start.current; clear(); start.current = null; if (st && !st.held) onTap(); },
    onPointerCancel() { clear(); start.current = null; },
    onPointerLeave() { clear(); start.current = null; },
    onContextMenu(e: React.MouseEvent) { e.preventDefault(); },
    onKeyDown(e: React.KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
      if (onHold && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); onHold(); }
    },
  };
}
