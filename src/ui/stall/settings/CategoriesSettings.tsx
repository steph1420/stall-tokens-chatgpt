// Categories editor (P-3 A, F-69): reorder (↑/↓), rename, default station, colour swatch, hide.
import { useState } from 'react';
import { CONFIG } from '../../../config';
import { cats, useApp, type AppState } from '../../../store';
import { Sheet } from '../../kit/Sheet';
import kit from '../../kit/kit.module.css';
import setStyles from './Settings.module.css';
import { Opt } from './Opt';

interface EditProps {
  cat: cats.Category | null;
  stations: readonly cats.Station[];
  onClose: () => void;
}

function SwatchPicker({ value, onPick }: { value: number; onPick: (v: number) => void }) {
  return (
    <div className={kit.swatches} role="radiogroup" aria-label="Default Colour">
      {Array.from({ length: CONFIG.swatchCount }, (_, i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`Colour ${String(i + 1)}`}
          className={value === i ? kit.swatchOn : kit.swatch}
          style={{ '--item-accent': `var(--dl-stall-swatch-${String(i)})` } as React.CSSProperties}
          onClick={() => { onPick(i); }} />
      ))}
    </div>
  );
}

function CategoryForm({ cat, stations, onClose }: EditProps) {
  const a = useApp((x) => x);
  const [name, setName] = useState(cat?.name ?? '');
  const [station, setStation] = useState(cat?.defaultStation ?? '');
  const [swatch, setSwatch] = useState(cat?.defaultSwatch ?? 0);
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    const id = cat ? cat.id : cats.categoryIdFor(name);
    const res = a.catalog.setCategory(id, { name, defaultStation: station, defaultSwatch: swatch });
    if (res) { setErr(res); return; }
    a.money.toast(cat ? 'Category updated' : 'Category added');
    onClose();
  };

  const remove = () => {
    if (!cat) return;
    a.catalog.setCategory(cat.id, {}, true);
    a.money.toast('Category hidden');
    onClose();
  };

  return (
    <Sheet title={cat ? 'Edit Category' : 'New Category'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input className={kit.input} placeholder="Category name" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} />
        <select className={kit.input} value={station} onChange={(e) => { setStation(e.target.value); }}>
          <option value="">No default station</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <SwatchPicker value={swatch} onPick={setSwatch} />
        {err ? <p className={setStyles.warnBox}>{err}</p> : null}
        <button type="button" className={kit.cta} onClick={save}>{cat ? 'Save' : 'Add Category'}</button>
        {cat ? <button type="button" className={kit.btnDanger} onClick={remove}>Hide Category</button> : null}
      </div>
    </Sheet>
  );
}

function reorderCategories(a: AppState, list: cats.Category[], from: number, to: number) {
  const itemA = list[from];
  const itemB = list[to];
  if (!itemA || !itemB) return;
  a.catalog.setCategory(itemA.id, { sortOrder: to });
  a.catalog.setCategory(itemB.id, { sortOrder: from });
}

export function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const items = Object.values(a.folded.items);
  const list = cats.categories(a.folded.records.category, items);
  const stationList = cats.activeStations(a.folded.records.station);
  const [editing, setEditing] = useState<cats.Category | null | 'new'>(null);

  return (
    <Sheet title="Categories" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button type="button" className={kit.cta} onClick={() => { setEditing('new'); }}>+ New Category</button>
        <div className={setStyles.snapList}>
          {list.map((c, i) => (
            <div key={c.id} className={setStyles.row}>
              <span className={setStyles.dot} style={{ '--item-accent': `var(--dl-stall-swatch-${String(c.defaultSwatch)})` } as React.CSSProperties} />
              <button type="button" className={setStyles.rowMain} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0 }} onClick={() => { setEditing(c); }}>
                <span className={setStyles.rowTitle}>{c.name}</span>
                <span className={setStyles.rowSub}>{c.defaultStation ? `Station: ${c.defaultStation}` : 'No station'}</span>
              </button>
              <div className={setStyles.actions}>
                <button type="button" className={setStyles.iconBtn} aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => { reorderCategories(a, list, i, i - 1); }}>↑</button>
                <button type="button" className={setStyles.iconBtn} aria-label={`Move ${c.name} down`} disabled={i === list.length - 1} onClick={() => { reorderCategories(a, list, i, i + 1); }}>↓</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing !== null ? <CategoryForm cat={editing === 'new' ? null : editing} stations={stationList} onClose={() => { setEditing(null); }} /> : null}
    </Sheet>
  );
}

export function CategoriesRow() {
  const a = useApp((x) => x);
  const items = Object.values(a.folded.items);
  const count = cats.categories(a.folded.records.category, items).length;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Opt t="Categories" sub="Item groupings, default stations and colours" value={`${String(count)} categories`} onClick={() => { setOpen(true); }} />
      {open ? <CategoriesSheet onClose={() => { setOpen(false); }} /> : null}
    </>
  );
}
