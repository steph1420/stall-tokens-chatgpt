// IST clock and "x min ago" for headers (en-GB, 24-hour). Display only; ordering never uses wall time.
const IST = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const MIN_MS = 60_000;

export const istClock = (ms: number): string => IST.format(ms);
export const istDay = (ms: number): string => IST_DAY.format(ms);
export function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.floor((now - ms) / MIN_MS));
  if (m < 1) return 'just now';
  if (m < 60) return `${String(m)} min ago`;
  return `${String(Math.floor(m / 60))} h ago`;
}
