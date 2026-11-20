// F-66 / F-67 Close the day and Day notes actions. The close record rides on the day note (record.set day_note, id = dayId),
// so every phone and the Sheet's day_notes tab see the same checklist (Q-SYNC-ALL). Each field is its own LWW target.
import { CONFIG } from '../config';
import type { Paise } from '../contract';
import type { Core, Log } from './core';
import type { Skippable } from './rules/close';

export type Extra = keyof typeof CONFIG.extras;
/** Q-P4-EXTRAS-ON A: on unless this phone has explicitly stored '0'. A missing key (never touched) is on. */
export const extraOn = (settings: Readonly<Record<string, string>>, extra: Extra): boolean => settings[CONFIG.extras[extra]] !== '0';

export function closeActions(core: Core, log: Log, lockWithSplit: () => boolean) {
  const st = () => core.get();
  const note = (dayId: string, fields: Record<string, string | number | boolean>) => {
    if (dayId) log.dispatch('record.set', { table: 'day_note', id: dayId, fields, removed: false });
  };
  return {
    /** Cash counted in the box (paise); null clears the count. */
    setCounted(dayId: string, counted: Paise | null) { note(dayId, { counted: counted === null ? -1 : Math.max(0, Math.min(CONFIG.limits.moneyMaxPaise, Math.trunc(counted))) }); },
    /** D-P4-SKIP: one tap leaves a step for later; the summary lists it. Tap again to bring it back. */
    skip(dayId: string, step: Skippable, on: boolean) { note(dayId, { [`skip_${step}`]: on }); },
    /** P-13 notes and quick chips (comma list). */
    setNotes(dayId: string, text: string, tags: readonly string[]) {
      note(dayId, { text: text.trim().slice(0, CONFIG.limits.recordTextMax), tags: tags.join(',').slice(0, CONFIG.limits.noteMaxChars) });
    },
    /** Lock the day (F-29). With partners, the Settle up split rules apply; with none there is nothing to split (D-P4-LOCK). */
    lockDay(dayId: string): boolean {
      const f = st().folded;
      if (!dayId || f.locks[dayId]?.locked) return false;
      if (Object.values(f.people).some((p) => p.isPartner)) return lockWithSplit();
      log.dispatch('day.lock', { dayId, locked: true, split: {} });
      return true;
    },
    /** FEATURES §0.2 / Q-P4-EXTRAS-ON A: shared switches; writing sets an explicit on or off. */
    setExtra(extra: Extra, on: boolean) { log.dispatch('setting.set', { key: CONFIG.extras[extra], value: on ? '1' : '0' }); },
  };
}
export type CloseActions = ReturnType<typeof closeActions>;
