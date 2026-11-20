// W-13 Back owner for the phone's Back button / gesture: one history entry is kept armed while the app is open, so a
// Back press steps back inside the app (store `back`, nav.backStep) and never leaves it mid-order. On the launch
// screen (nothing left to close) the press is let through.
import { useEffect } from 'react';
import { useApp } from '../../store';

export function useBackTrap(): void {
  const back = useApp((s) => s.back);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.history.pushState({ stallTrap: true }, '');
    const onPop = () => {
      if (back()) window.history.pushState({ stallTrap: true }, '');
      else window.history.back();
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, [back]);
}
