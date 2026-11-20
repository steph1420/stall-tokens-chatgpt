// Menu items, stock and payees (F-07 F-08 F-15). Names are typed in the app, never shipped in the repo.
import { CONFIG } from '../config';
import type { ItemFields, MenuPriceOption } from '../contract';
import type { Core, Log } from './core';
import { isUpiId } from './rules/upi';
import * as amounts from './rules/amounts';

export type ItemDraft = Pick<ItemFields, 'name' | 'price' | 'swatch' | 'category' | 'stationId'> & { count: number | null; unit?: string; addons?: readonly MenuPriceOption[]; variants?: readonly MenuPriceOption[]; secondaryUnit?: string; secondaryUnitsPerPrimary?: number; discountKind?: 'none' | 'amount' | 'pct'; discountValue?: number };

// eslint-disable-next-line max-lines-per-function -- item validation and persistence form one atomic domain action.
function itemActions(core: Core, log: Log) {
  const st = () => core.get();
  return {
    /** Add or edit an item. Returns an error message or null. */
    saveItem(itemId: string | null, d: ItemDraft): string | null {
      const name = d.name.trim().replace(/\s+/g, ' ').slice(0, CONFIG.limits.nameMaxChars);
      if (!name) return 'Give the item a name';
      if (!Number.isSafeInteger(d.price) || d.price < 0 || d.price > CONFIG.limits.moneyMaxPaise) return 'Check the price';
      if (d.count !== null && (!Number.isSafeInteger(d.count) || d.count < 0)) return 'Stock must be 0 or more';
      const items = Object.values(st().folded.items).filter((i) => !i.removed);
      if (!itemId && items.length >= CONFIG.limits.itemsMax) return 'The menu is full';
      const order = itemId ? undefined : items.reduce((m, i) => Math.max(m, i.order), 0) + 1;
      const id = itemId ?? core.env.makeId();
      const swatch = Math.abs(Math.trunc(d.swatch)) % CONFIG.swatchCount;
      const previous = itemId ? st().folded.items[itemId] : undefined;
      const cleanOptions = (options: readonly MenuPriceOption[] | undefined): readonly MenuPriceOption[] => (options ?? []).slice(0, 30)
        .map((x) => ({ id: x.id.trim().slice(0, 80), name: x.name.trim().replace(/\s+/g, ' ').slice(0, 60), priceDelta: Math.trunc(x.priceDelta) }))
        .filter((x) => x.id && x.name && Number.isSafeInteger(x.priceDelta) && Math.abs(x.priceDelta) <= CONFIG.limits.moneyMaxPaise);
      const addons = cleanOptions(d.addons ?? previous?.addons);
      const variants = cleanOptions(d.variants ?? previous?.variants);
      if ((d.addons ?? previous?.addons ?? []).length !== addons.length || (d.variants ?? previous?.variants ?? []).length !== variants.length) return 'Check add-on and variant names and prices';
      const discountKind = d.discountKind ?? previous?.discountKind ?? 'none';
      const rawDiscount = d.discountValue ?? previous?.discountValue ?? 0;
      if (!Number.isSafeInteger(rawDiscount) || rawDiscount < 0) return 'Check the item discount';
      const discountValue = rawDiscount;
      if ((discountKind === 'pct' && discountValue > 100) || (discountKind === 'amount' && discountValue > d.price)) return 'Check the item discount';
      const rawConversion = d.secondaryUnitsPerPrimary ?? previous?.secondaryUnitsPerPrimary ?? 1;
      if (!Number.isSafeInteger(rawConversion) || rawConversion < 1 || rawConversion > 100000) return 'Check the unit conversion';
      const secondaryUnitsPerPrimary = rawConversion;
      log.dispatch('item.set', { itemId: id, fields: {
        name, price: d.price, swatch, category: d.category.trim(), stationId: d.stationId, count: d.count,
        unit: (d.unit ?? previous?.unit ?? '').trim().slice(0, 20),
        addons, variants, secondaryUnit: (d.secondaryUnit ?? previous?.secondaryUnit ?? '').trim().slice(0, 20),
        secondaryUnitsPerPrimary, discountKind, discountValue,
        ...(order === undefined ? {} : { order, lowAt: CONFIG.stock.lowAtDefault })
      } });
      return null;
    },
    removeItem(itemId: string) { log.dispatch('item.set', { itemId, fields: { removed: true } }); },
    /** F-08 press-and-hold panel: −/+ (never below 0) and Mark sold out. */
    adjustStock(itemId: string, delta: number) {
      const it = st().folded.items[itemId];
      if (!it) return;
      if (it.count === null) { if (delta > 0) log.dispatch('item.set', { itemId, fields: { count: Math.trunc(delta), soldOut: false } }); return; }
      if (it.count + delta < 0) return;
      log.dispatch('stock.adjust', { itemId, delta: Math.trunc(delta), reason: 'panel' });
      if (it.soldOut && it.count + delta > 0) log.dispatch('item.set', { itemId, fields: { soldOut: false } });
    },
    setSoldOut(itemId: string, soldOut: boolean) { log.dispatch('item.set', { itemId, fields: { soldOut } }); },
  };
}

/** P-3 A / PK-6 A: edit a category or station by id (a virtual one becomes a record with the same id; rename keeps it). */
function recordActions(log: Log) {
  const name = (t: string) => t.trim().replace(/\s+/g, ' ').slice(0, CONFIG.limits.nameMaxChars);
  return {
    setCategory(id: string, f: { name?: string; sortOrder?: number; defaultStation?: string; defaultSwatch?: number }, removed = false): string | null {
      const fields: Record<string, string | number> = {};
      if (f.name !== undefined) { if (!name(f.name)) return 'Give the category a name'; fields.name = name(f.name); }
      if (f.sortOrder !== undefined) fields.sort_order = Math.trunc(f.sortOrder);
      if (f.defaultStation !== undefined) fields.default_station = f.defaultStation;
      if (f.defaultSwatch !== undefined) fields.default_swatch = Math.abs(Math.trunc(f.defaultSwatch)) % CONFIG.swatchCount;
      log.dispatch('record.set', { table: 'category', id, fields, removed });
      return null;
    },
    setStation(id: string, f: { name?: string; icon?: string; colour?: string; sortOrder?: number }, removed = false): string | null {
      const fields: Record<string, string | number> = {};
      if (f.name !== undefined) { if (!name(f.name)) return 'Give the station a name'; fields.name = name(f.name); }
      if (f.icon !== undefined) fields.icon = f.icon.slice(0, 8);
      if (f.colour !== undefined) fields.colour = f.colour.slice(0, 20);
      if (f.sortOrder !== undefined) fields.sort_order = Math.trunc(f.sortOrder);
      log.dispatch('record.set', { table: 'station', id, fields, removed });
      return null;
    },
    /** P-13 day note (id = dayId; text and tags). */
    setDayNote(dayId: string, text: string, tags: string) {
      log.dispatch('record.set', { table: 'day_note', id: dayId, fields: { text: text.trim().slice(0, CONFIG.limits.recordTextMax), tags: tags.trim().slice(0, CONFIG.limits.noteMaxChars) }, removed: false });
    },
  };
}

/** F-15 UPI IDs and shared settings. */
function payeeActions(core: Core, log: Log) {
  const st = () => core.get();
  return {
    savePayee(payeeId: string | null, name: string, upiId: string): string | null {
      const n = name.trim().slice(0, CONFIG.limits.nameMaxChars);
      const u = upiId.trim().slice(0, CONFIG.limits.upiIdMaxChars);
      if (!n) return 'Add a name';
      if (!isUpiId(u)) return 'That does not look like a UPI ID (name@bank)';
      if (!payeeId && Object.keys(st().folded.payees).length >= CONFIG.limits.payeesMax) return 'Too many UPI IDs';
      log.dispatch('payee.set', { payeeId: payeeId ?? core.env.makeId(), name: n, upiId: u, removed: false });
      return null;
    },
    /** Shared stall settings (stall name). Trimmed and length-capped. */
    setSetting(key: string, value: string) {
      const content = key === 'printTemplate' ? value : value.trim().replace(/\s+/g, ' ');
      const limit = key === 'printTemplate' ? 200_000 : CONFIG.limits.recordTextMax;
      log.dispatch('setting.set', { key, value: content.slice(0, limit) });
    },
    /** F-45 tip choices / round-off steps for every phone: text in rupees; returns an error line or null. */
    setAmounts(key: amounts.AmountsKey, text: string): string | null {
      const r = amounts.parseRupees(text, key);
      if ('error' in r) return r.error;
      log.dispatch('setting.set', { key, value: r.ok.join(',') });
      return null;
    },
    removePayee(payeeId: string) {
      const p = st().folded.payees[payeeId];
      if (p) log.dispatch('payee.set', { payeeId, name: p.name, upiId: p.upiId, removed: true });
    },
  };
}

export function catalogActions(core: Core, log: Log) { return { ...itemActions(core, log), ...payeeActions(core, log), ...recordActions(log) }; }
