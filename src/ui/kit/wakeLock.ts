// F-60 PK-3 sub-item (K4 note): keep the screen awake while the Kitchen or a Station is open, where the browser allows it.
// Silent when unsupported or refused; taken again when the page comes back into view.
import { useEffect } from 'react';

export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return undefined;
    const api = navigator.wakeLock;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      api.request('screen').then((l) => { if (live) lock = l; else void l.release(); }, () => undefined);
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { live = false; document.removeEventListener('visibilitychange', take); void lock?.release(); };
  }, [on]);
}
