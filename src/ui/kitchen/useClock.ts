// W-38 ticket ages: one shared clock tick (CONFIG.timings.clockTickMs), not one timer per card.
import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';

export function useClock(): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => { setT(Date.now()); }, CONFIG.timings.clockTickMs); return () => { clearInterval(i); }; }, []);
  return t;
}
