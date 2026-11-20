// F-30 Stock (21-polish2/stock.html; Q-STOCK-SET): search, navrail of categories + Low · n + Sold out, rows with counts
// (amber when low, dimmed Sold out at zero); tap a row for −/+. Paste stock opens the paste sheet (F-31).
// F-68 (P4, FEATURES §20): the rail starts with All; Low and Sold out are filter chips over the list, not categories.
import { useState } from 'react';
import type { Item } from '../../contract';
import { stock, useApp } from '../../store';
import { StallPage } from '../stall/StallPage';
import { PasteSheet } from './PasteSheet';
import s from './Stock.module.css';

type Rail = { kind: 'all' } | { kind: 'cat'; name: string };
type Chip = 'low' | 'out' | null;

function Row({ it, open, onOpen }: { it: Item; open: boolean; onOpen: () => void }) {
  const a = useApp((x) => x.stock);
  const lv = stock.level(it);
  const dot = { '--c': `var(--dl-stall-swatch-${String(it.swatch)})` } as React.CSSProperties;
  return (
    <div className={[s.row, open ? s.rowOpen : '', lv === 'out' ? s.out : ''].join(' ')}>
      <button type="button" className={s.rowTap} aria-expanded={open} onClick={onOpen}>
        <span className={s.dot} style={dot} aria-hidden="true" />
        <span className={s.name}>{it.name}</span>
      </button>
      {open ? (
        <span className={s.stepper}>
          <button type="button" aria-label={`Less ${it.name}`} onClick={() => { a.step(it.id, -1); }}>−</button>
          <b className={lv === 'low' ? s.low : undefined}>{it.count ?? '–'}</b>
          <button type="button" aria-label={`More ${it.name}`} onClick={() => { a.step(it.id, 1); }}>+</button>
        </span>
      ) : <b className={lv === 'low' ? s.low : lv === 'out' ? s.soldOut : lv === 'none' ? s.none : s.count}>{lv === 'out' ? 'Sold out' : lv === 'none' ? 'Not counted' : `${String(it.count)}${it.unit ? ` ${it.unit}` : ''}`}</b>}
    </div>
  );
}

export function StockScreen() {
  const all = useApp((x) => Object.values(x.folded.items).filter((i) => !i.removed).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
  const cats = [...new Set(all.map((i) => i.category || 'Other'))];
  const [rail, setRail] = useState<Rail>({ kind: 'all' });
  const [chip, setChip] = useState<Chip>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const inRail = rail.kind === 'all' ? all : all.filter((i) => (i.category || 'Other') === rail.name);
  const low = inRail.filter((i) => stock.level(i) === 'low');
  const out = inRail.filter((i) => stock.level(i) === 'out');
  const shown = q.trim() ? all.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())) : chip === 'low' ? low : chip === 'out' ? out : inRail;
  const on = (r: Rail) => !q.trim() && (r.kind === 'all' ? rail.kind === 'all' : rail.kind === 'cat' && r.name === rail.name);
  const railBtn = (r: Rail, icon: string, label: string) => (
    <button type="button" key={label} role="tab" aria-selected={on(r)} className={on(r) ? s.railOn : s.rail} onClick={() => { setRail(r); setQ(''); }}>
      <span className={s.railIcon} aria-hidden="true">{icon}</span><span>{label}</span>
    </button>
  );
  const chipBtn = (c: 'low' | 'out', label: string) => (
    <button type="button" aria-pressed={chip === c} className={chip === c ? s.chipOn : s.chip} onClick={() => { setChip(chip === c ? null : c); }}>{label}</button>
  );
  return (
    <StallPage title="Stock" right={<button type="button" className={s.pBtn} onClick={() => { setPaste(true); }}>📋 Paste</button>}>
      <input className={s.search} aria-label="Search items" placeholder="Search items" value={q} onChange={(e) => { setQ(e.target.value); }} />
      <div className={s.split}>
        <nav className={s.rails} role="tablist" aria-label="Categories">
          {railBtn({ kind: 'all' }, '☰', 'All')}
          {cats.map((c) => railBtn({ kind: 'cat', name: c }, c.slice(0, 1).toUpperCase(), c))}
        </nav>
        <div className={s.list}>
          {q.trim() ? null : <div className={s.chips} role="group" aria-label="Show only">{chipBtn('low', `Low · ${String(low.length)}`)}{chipBtn('out', `Sold out · ${String(out.length)}`)}</div>}
          {shown.length === 0 ? <p className={s.empty}>{q ? 'No item by that name.' : chip ? 'Nothing here.' : 'No items yet. Paste a bill or add one.'}</p> : null}
          {shown.map((it) => <Row key={it.id} it={it} open={open === it.id} onOpen={() => { setOpen(open === it.id ? null : it.id); }} />)}
          <button type="button" className={s.add} onClick={() => { setPaste(true); }}>+ Add item</button>
        </div>
      </div>
      {paste ? <PasteSheet onClose={() => { setPaste(false); }} /> : null}
    </StallPage>
  );
}
