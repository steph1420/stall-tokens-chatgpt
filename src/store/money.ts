// F-23..F-25 Money actions: Spent / Received entries (Paid by incl. Mixed), people, refunds due from cancels.
import { CONFIG } from '../config';
import type { EntryBody, MoneyPart, PaySource } from '../contract';
import type { Core, Log } from './core';
import { held } from './rules/bill';
import { checkEntry } from './rules/money';

export type EntryDraft = Omit<EntryBody, 'entryId' | 'dayId'>;
const clean = (v: string, max: number) => v.trim().replace(/\s+/g, ' ').slice(0, max);

const istDate = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

/** F-32 Open the stall: Start day begins today's day when the last one is from another date, then records the float. */
function floatActions(core: Core, log: Log) {
  return {
    toast: (text: string) => { core.set((s) => ({ ui: { ...s.ui, toast: { text, id: (s.ui.toast?.id ?? 0) + 1 } } })); },
    openStall(float: number): string {
      const now = core.env.now();
      const last = core.get().folded.days[core.get().folded.days.length - 1];
      let dayId = last?.id ?? '';
      if (!last || last.label !== istDate(now)) {
        dayId = `${istDate(now)}-${core.env.makeId().slice(0, 4)}`;
        log.dispatch('day.start', { dayId, label: istDate(now) });
      }
      log.dispatch('setting.set', { key: `float:${dayId}`, value: String(Math.max(0, Math.trunc(float))) });
      return dayId;
    },
  };
}

export function moneyActions(core: Core, log: Log) {
  const st = () => core.get();
  const dayId = () => st().folded.days[st().folded.days.length - 1]?.id ?? '';
  const fl = floatActions(core, log);
  return {
    ...fl,
    /** Save a Spent or Received entry. Returns an error to show, or null. */
    addEntry(d: EntryDraft): string | null {
      const parts: MoneyPart[] = d.parts.map((p) => ({ ...p, amount: Math.trunc(p.amount) }));
      const err = checkEntry(Math.trunc(d.amount), parts);
      if (err) return err;
      if (d.amount > CONFIG.limits.moneyMaxPaise) return 'That amount is too big';
      if (st().folded.locks[dayId()]?.locked) return 'Day is locked · reopen it in Settle up';
      log.dispatch('entry.add', { ...d, amount: Math.trunc(d.amount), parts, label: clean(d.label, CONFIG.limits.nameMaxChars), note: clean(d.note, CONFIG.limits.noteMaxChars), entryId: core.env.makeId(), dayId: dayId() });
      return null;
    },
    voidEntry(entryId: string, reason: string): boolean {
      const e = st().folded.entries.find((x) => x.id === entryId);
      if (!e || e.voided !== null) return false;
      log.dispatch('entry.void', { entryId, reason: clean(reason, CONFIG.limits.noteMaxChars) });
      return true;
    },
    /** Add or edit a person (Personal / From / partners). Returns the id, or null when the name is empty or taken. */
    savePerson(personId: string | null, name: string, partner?: { isPartner: boolean; sharePct: number }): string | null {
      const n = clean(name, CONFIG.limits.nameMaxChars);
      const people = Object.values(st().folded.people);
      if (!n || people.some((p) => p.id !== personId && p.name.toLowerCase() === n.toLowerCase())) return null;
      const prev = personId ? st().folded.people[personId] : undefined;
      const id = personId ?? core.env.makeId();
      log.dispatch('person.set', { personId: id, name: n, isPartner: partner?.isPartner ?? prev?.isPartner ?? false, sharePct: partner?.sharePct ?? prev?.sharePct ?? 0, removed: false });
      return id;
    },
    /** Q-CANCEL-1 A: give back what a cancelled order holds (including tips, FIN-01). */
    refundCancelled(orderId: string, source: PaySource): boolean {
      const o = st().folded.orders[orderId];
      const due = o?.cancel ? held(o) : 0;
      if (!o || due <= 0) return false;
      log.dispatch('refund.add', { refundId: core.env.makeId(), orderId, amount: due, source });
      fl.toast(`Refunded #${String(o.token).padStart(CONFIG.tokens.pad, '0')}`);
      return true;
    },
  };
}
export type MoneyActions = ReturnType<typeof moneyActions>;
