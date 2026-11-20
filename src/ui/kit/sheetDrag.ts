// Shared drag-to-dismiss for any bottom sheet with a handle: follow the finger, close on a downward flick
// or if dragged far enough, otherwise snap back. Tap-outside is handled by each sheet's scrim.
import { useRef, useState, type PointerEvent as PE } from 'react';

const CLOSE_PX = 80;
const FLICK = 0.55; // px/ms

export function useSheetDrag(onClose: () => void) {
  const [y, setY] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);
  const down = (e: PE<HTMLElement>) => {
    start.current = { y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PE<HTMLElement>) => {
    if (!start.current) return;
    setY(Math.max(0, e.clientY - start.current.y));
  };
  const up = (e: PE<HTMLElement>) => {
    if (!start.current) return;
    const dy = Math.max(0, e.clientY - start.current.y);
    const dt = Math.max(1, performance.now() - start.current.t);
    start.current = null;
    if (dy > CLOSE_PX || dy / dt > FLICK) onClose();
    else setY(0);
  };
  return { y, handle: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up } };
}
