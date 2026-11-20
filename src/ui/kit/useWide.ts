// F-61 P3b: is there room for two panes? Measured in root rem (so 200 % text keeps one column) and needs some height
// (so a phone on its side keeps the phone layout). Updates on resize / rotate.
import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';

const rootRem = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || CONFIG.layout.baseFontPx;

function measure(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const rem = rootRem();
  return window.innerWidth >= CONFIG.layout.twoPaneMinRem * rem && window.innerHeight >= CONFIG.layout.twoPaneMinHeightRem * rem;
}

/** Large text (≥ 150 %): rows that scroll sideways at normal text wrap instead (Kitchen pills on a tablet at 200 %). */
const measureBig = (): boolean => typeof document !== 'undefined' && rootRem() >= CONFIG.layout.baseFontPx * CONFIG.layout.bigTextScale;

export const useBigText = (): boolean => useMeasured(measureBig);
export const useWide = (): boolean => useMeasured(measure);

function useMeasured(f: () => boolean): boolean {
  const [wide, setWide] = useState(f);
  useEffect(() => {
    const on = () => { setWide(f()); };
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    on();
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, [f]);
  return wide;
}
