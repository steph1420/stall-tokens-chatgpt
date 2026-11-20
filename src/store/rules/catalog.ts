// F-52 P-3 A categories and PK-6 A stations as data (2.1.0 P1). Pure. No migration ops are written:
// - Categories = category records + virtual ones with deterministic ids `name:<text>` for each distinct legacy
//   `item.category`. Editing a virtual one writes `record.set category name:<text>`, so two phones doing the same edit
//   converge on one id (no duplicates), and old items still match by name.
// - Stations = station records + virtual ones from CONFIG.stations. A station's id stays its first name (today's
//   `line.stationId`), so no line or item changes; a rename only sets `fields.name`. `removed` = inactive.
import { CONFIG } from '../../config';
import type { InfoRecord, Item } from '../../contract';

export interface Category { readonly id: string; readonly name: string; readonly sortOrder: number; readonly defaultStation: string; readonly defaultSwatch: number; readonly virtual: boolean }
export interface Station { readonly id: string; readonly name: string; readonly icon: string; readonly colour: string; readonly sortOrder: number; readonly active: boolean; readonly virtual: boolean }

type Rows = Readonly<Record<string, InfoRecord>> | undefined;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clean = (t: string): string => t.trim().replace(/\s+/g, ' ');

/** Deterministic id of a virtual category from its legacy text (same on every phone). */
export const categoryIdFor = (text: string): string => `name:${clean(text).toLowerCase()}`;
/** The category an item belongs to: its record id, else the virtual id of its legacy text ('' = none). */
export const itemCategoryId = (it: Pick<Item, 'categoryId' | 'category'>): string =>
  it.categoryId || (clean(it.category) ? categoryIdFor(it.category) : '');

export function categories(rows: Rows, items: readonly Pick<Item, 'category' | 'categoryId' | 'removed'>[]): Category[] {
  const out = new Map<string, Category>();
  const hidden = new Set<string>();
  for (const r of Object.values(rows ?? {})) {
    if (r.removed) { hidden.add(r.id); continue; }
    const name = clean(str(r.fields.name)) || r.id.replace(/^name:/, '');
    out.set(r.id, { id: r.id, name, sortOrder: num(r.fields.sort_order, 1e6), defaultStation: str(r.fields.default_station),
      defaultSwatch: num(r.fields.default_swatch, 0), virtual: false });
  }
  for (const it of items) {
    if (it.removed || it.categoryId || !clean(it.category)) continue;
    const id = categoryIdFor(it.category);
    if (out.has(id) || hidden.has(id)) continue;
    out.set(id, { id, name: clean(it.category), sortOrder: 1e6, defaultStation: '', defaultSwatch: 0, virtual: true });
  }
  return [...out.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function stations(rows: Rows): Station[] {
  const out = new Map<string, Station>();
  CONFIG.stations.forEach((name, i) => { out.set(name, { id: name, name, icon: '', colour: '', sortOrder: i, active: true, virtual: true }); });
  for (const r of Object.values(rows ?? {})) {
    const base = out.get(r.id);
    out.set(r.id, {
      id: r.id, name: clean(str(r.fields.name)) || base?.name || r.id, icon: str(r.fields.icon, base?.icon ?? ''), colour: str(r.fields.colour, base?.colour ?? ''),
      sortOrder: num(r.fields.sort_order, base?.sortOrder ?? 1e6), active: !r.removed, virtual: false,
    });
  }
  return [...out.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
/** Active stations only (launch tiles, kitchen pills; PK-6). */
export const activeStations = (rows: Rows): Station[] => stations(rows).filter((x) => x.active);
