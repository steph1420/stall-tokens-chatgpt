// F-26..F-29 Settlement actions: Pay (partial ok), Repay all, Mark cleared with a reason, undo, partner shares, lock / reopen.
import { CONFIG } from '../config';
import type { ClearReason, MoneySource, Paise } from '../contract';
import { formatInr } from '../contract';
import type { Core, Log } from './core';
import { liveOrders } from './fold/fold';
import { balances, split } from './rules/settle';

export function settleActions(core: Core, log: Log) {
  const st = () => core.get();
  const toast = (text: string) => { core.set((s) => ({ ui: { ...s.ui, toast: { text, id: (s.ui.toast?.id ?? 0) + 1 } } })); };
  const dayId = () => st().folded.days[st().folded.days.length - 1]?.id ?? '';
  const locked = () => { const l = st().folded.locks[dayId()]; if (l?.locked) toast('Day is locked · reopen it to change'); return l?.locked === true; };
  const self = {
    /** Pay a person (or take money back when they hold stall money). `amount` is what moves now; partial is fine. */
    pay(personId: string, amount: Paise, via: MoneySource, byPersonId: string | null = null): boolean {
      const bal = balances(st().folded)[personId] ?? 0;
      const a = Math.trunc(amount);
      if (locked() || a === 0 || Math.sign(a) !== Math.sign(bal) || Math.abs(a) > Math.abs(bal)) return false;
      if (via === 'person' && (!byPersonId || byPersonId === personId)) return false;
      log.dispatch('settle.pay', { payId: core.env.makeId(), dayId: dayId(), personId, amount: a, via, byPersonId: via === 'person' ? byPersonId : null });
      return true;
    },
    /** Step 1 Repay all: every other person the stall owes, from the register. */
    repayAll(via: MoneySource = 'register'): number {
      const s = split(st().folded, liveOrders(st().folded), dayId());
      return s.others.filter((o) => o.owed > 0).filter((o) => self.pay(o.person.id, o.owed, via)).length;
    },
    /** Mark cleared: the balance goes to zero, nothing recorded in money (Q-VOUCH-1 wording). */
    clear(personId: string, reason: ClearReason, note: string): boolean {
      const bal = balances(st().folded)[personId] ?? 0;
      if (locked() || bal === 0) return false;
      log.dispatch('settle.clear', { clearId: core.env.makeId(), dayId: dayId(), personId, amount: bal, reason, note: note.trim().slice(0, CONFIG.limits.noteMaxChars) });
      return true;
    },
    undo(id: string): boolean {
      const x = st().folded.settlements.find((y) => y.id === id);
      if (!x || x.undone || locked()) return false;
      log.dispatch('settle.undo', { targetId: id, reason: '' });
      toast(x.kind === 'pay' ? 'Payment undone' : 'Mark cleared undone');
      return true;
    },
  };
  return { ...self, ...dayActions(core, log, dayId) };
}

function dayActions(core: Core, log: Log, dayId: () => string) {
  const st = () => core.get();
  const toast = (text: string) => { core.set((s) => ({ ui: { ...s.ui, toast: { text, id: (s.ui.toast?.id ?? 0) + 1 } } })); };
  return {
    setPartner(personId: string, isPartner: boolean, sharePct: number) {
      const p = st().folded.people[personId];
      if (p) log.dispatch('person.set', { personId, name: p.name, isPartner, sharePct: Math.max(0, Math.min(100, Math.round(sharePct))), removed: false });
    },
    /** Split (or Split anyway) locks the day with the amounts shown; Reopen unlocks it (Q-SETTLE-GAPS). */
    lockDay(): boolean {
      const s = split(st().folded, liveOrders(st().folded), dayId());
      if (!s.sharesOk) { toast(s.mode === 'exact' ? `Exact amounts must add up to ${formatInr(s.base)}` : 'Partner shares must add up to 100%'); return false; }
      log.dispatch('day.lock', { dayId: dayId(), locked: true, split: Object.fromEntries(s.partners.map((p) => [p.person.id, p.share])) });
      return true;
    },
    /** F-47 split type and exact amounts, shared with every phone (setting.set). */
    setSplitMode(mode: 'share' | 'exact') { log.dispatch('setting.set', { key: 'splitMode', value: mode }); },
    setExact(personId: string, amount: Paise) { log.dispatch('setting.set', { key: `splitExact:${personId}`, value: String(Math.max(-CONFIG.limits.moneyMaxPaise, Math.min(CONFIG.limits.moneyMaxPaise, Math.trunc(amount)))) }); },
    reopenDay() { log.dispatch('day.lock', { dayId: dayId(), locked: false, split: {} }); },
  };
}
