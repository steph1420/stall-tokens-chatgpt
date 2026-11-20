// F-53 W-22 day rollover (2.1.0 P1). Pure. Days are IST dates; tokens restart per day (D-TOKEN).
import type { Day, DayLock } from '../../contract';

/** IST calendar date (yyyy-mm-dd) of a moment. */
export const istDate = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

export type Rollover = 'none' | 'same' | 'new' | 'ask';
/**
 * What the Counter does on its next new order:
 * - `none`: no day yet → start today.
 * - `same`: the last day started on today's IST date → keep it.
 * - `new`: a new IST date and the last day is locked (closed) → start today without asking.
 * - `ask`: a new IST date and the last day is not closed → ask "Start today (tokens from #001) or keep yesterday's day?".
 */
export function rollover(days: readonly Day[], locks: Readonly<Record<string, DayLock>>, now: number): Rollover {
  const last = days[days.length - 1];
  if (!last) return 'none';
  if (istDate(last.startedAt) === istDate(now)) return 'same';
  return locks[last.id]?.locked === true ? 'new' : 'ask';
}
