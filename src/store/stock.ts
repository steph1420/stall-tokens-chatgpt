// F-30 / F-31 Stock actions: set a count, and Paste stock (adds stock per line + one Spent entry for the total, Q-PASTE-1 A).
// F-46 Q-SUPPLY-CONFIRM B (Steve 16 Nov 19:33 IST): each thing not yet known is marked "Menu" or "Stock only" before saving.
import { CONFIG } from '../config';
import type { Item, MoneyPart } from '../contract';
import type { Core, Log } from './core';
import { matchItem, pasteTotal, usable, type PasteLine } from './rules/stock';

/** Per new thing (key: lower-case name): a Menu item or a Stock-only supply. */
export type NewKinds = Readonly<Record<string, 'menu' | 'stock'>>;
export const kindKey = (name: string): string => name.trim().toLowerCase();

type AddSpent = (amount: number, label: string, note: string, parts: MoneyPart[]) => string | null;
/** One Spent entry for the priced lines (W-23: count-only lines add no money). */
function spend(ok: readonly PasteLine[], parts: MoneyPart[], known: readonly Item[], addSpent: AddSpent): string | null {
  const total = pasteTotal(ok, known);
  const priced = ok.filter((l) => l.priced);
  return total > 0 ? addSpent(total, `Stock · ${String(priced.length)} ${priced.length === 1 ? 'item' : 'items'}`, priced.map((l) => l.name).join(', '), parts) : null;
}

export function stockActions(core: Core, log: Log, addSpent: AddSpent) {
  const st = () => core.get();
  const items = () => Object.values(st().folded.items);
  const addNew = (l: PasteLine, order: number, menu: boolean) => {
    const where = menu ? { category: CONFIG.stock.newMenuCategory, stationId: CONFIG.stations[0], lowAt: CONFIG.stock.lowAtDefault } : { category: CONFIG.stock.supplyCategory, stationId: '', lowAt: 0 };
    log.dispatch('item.set', { itemId: core.env.makeId(), fields: { name: l.name.slice(0, CONFIG.limits.nameMaxChars), price: 0, swatch: 0, ...where, count: l.qty, unit: l.unit, order, supply: !menu, soldOut: false, removed: false } });
  };
  const addLine = (l: PasteLine, order: number, kinds: NewKinds) => {
    const it = matchItem(items(), l.name);
    if (!it) { addNew(l, order, kinds[kindKey(l.name)] === 'menu'); return; }
    if (it.count === null) log.dispatch('item.set', { itemId: it.id, fields: { count: l.qty, soldOut: false } });
    else log.dispatch('stock.adjust', { itemId: it.id, delta: l.qty, reason: 'paste' });
    if (it.soldOut && it.count !== null) log.dispatch('item.set', { itemId: it.id, fields: { soldOut: false } });
    if (!it.unit && l.unit) log.dispatch('item.set', { itemId: it.id, fields: { unit: l.unit } });
  };
  return {
    /** Adds every clear line; the Spent entry goes first so a refused entry (Mixed not covered, day locked) adds nothing. */
    paste(lines: readonly PasteLine[], parts: MoneyPart[], kinds: NewKinds = {}): string | null {
      const ok = lines.filter((l) => usable(l, items()));
      if (!ok.length) return 'Nothing to add yet';
      const open = ok.find((l) => !matchItem(items(), l.name) && !kinds[kindKey(l.name)]);
      if (open) return `Choose Menu or Stock only for ${open.name}`;
      const err = spend(ok, parts, items(), addSpent);
      if (err) return err;
      const top = items().reduce((m, i) => Math.max(m, i.order), 0);
      ok.forEach((l, i) => { addLine(l, top + i + 1, kinds); });
      return null;
    },
    /** Stock screen −/+: never below 0 (plan §7.2). */
    step(itemId: string, delta: number) {
      const it = st().folded.items[itemId];
      if (!it) return;
      if (it.count === null) { if (delta > 0) log.dispatch('item.set', { itemId, fields: { count: Math.trunc(delta), soldOut: false } }); return; }
      if (it.count + delta < 0) return;
      log.dispatch('stock.adjust', { itemId, delta: Math.trunc(delta), reason: 'stock' });
      if (it.soldOut && it.count + delta > 0) log.dispatch('item.set', { itemId, fields: { soldOut: false } });
    },
  };
}
