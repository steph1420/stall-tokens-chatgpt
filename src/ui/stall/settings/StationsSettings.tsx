// Stations editor (PK-6, F-69): Name, icon, colour, order, active toggle.
import { useState } from 'react';
import { cats, useApp, type AppState } from '../../../store';
import { Sheet } from '../../kit/Sheet';
import kit from '../../kit/kit.module.css';
import setStyles from './Settings.module.css';
import { Opt } from './Opt';

function StationForm({ stn, onClose }: { stn: cats.Station; onClose: () => void }) {
  const a = useApp((x) => x);
  const [name, setName] = useState(stn.name);
  const [icon, setIcon] = useState(stn.icon);
  const [colour, setColour] = useState(stn.colour);
  const [active, setActive] = useState(stn.active);
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    const res = a.catalog.setStation(stn.id, { name, icon, colour }, !active);
    if (res) { setErr(res); return; }
    a.money.toast('Station updated');
    onClose();
  };

  return (
    <Sheet title={`Edit Station: ${stn.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input className={kit.input} placeholder="Station name" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} />
        <input className={kit.input} placeholder="Icon or emoji" value={icon} maxLength={8} onChange={(e) => { setIcon(e.target.value); }} />
        <input className={kit.input} placeholder="Colour (e.g. #38bdf8)" value={colour} maxLength={20} onChange={(e) => { setColour(e.target.value); }} />
        <button type="button" className={kit.choice} onClick={() => { setActive(!active); }}>
          {active ? 'Status: Active' : 'Status: Inactive'}
        </button>
        {err ? <p className={setStyles.warnBox}>{err}</p> : null}
        <button type="button" className={kit.cta} onClick={save}>Save Changes</button>
      </div>
    </Sheet>
  );
}

function reorderStations(a: AppState, list: cats.Station[], from: number, to: number) {
  const sA = list[from];
  const sB = list[to];
  if (!sA || !sB) return;
  a.catalog.setStation(sA.id, { sortOrder: to }, !sA.active);
  a.catalog.setStation(sB.id, { sortOrder: from }, !sB.active);
}

export function StationsSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const list = cats.stations(a.folded.records.station);
  const [editing, setEditing] = useState<cats.Station | null>(null);

  return (
    <Sheet title="Kitchen Stations" onClose={onClose}>
      <div className={setStyles.snapList}>
        {list.map((stn, i) => (
          <div key={stn.id} className={setStyles.row}>
            <button type="button" className={setStyles.rowMain} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0 }} onClick={() => { setEditing(stn); }}>
              <span className={setStyles.rowTitle}>{stn.icon ? `${stn.icon} ${stn.name}` : stn.name}</span>
              <span className={setStyles.rowSub}>{stn.active ? 'Active' : 'Inactive'}</span>
            </button>
            <div className={setStyles.actions}>
              <button type="button" className={setStyles.iconBtn} aria-label={`Move ${stn.name} up`} disabled={i === 0} onClick={() => { reorderStations(a, list, i, i - 1); }}>↑</button>
              <button type="button" className={setStyles.iconBtn} aria-label={`Move ${stn.name} down`} disabled={i === list.length - 1} onClick={() => { reorderStations(a, list, i, i + 1); }}>↓</button>
              <button type="button" className={kit.small} onClick={() => { a.catalog.setStation(stn.id, {}, stn.active); }}>
                {stn.active ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing ? <StationForm stn={editing} onClose={() => { setEditing(null); }} /> : null}
    </Sheet>
  );
}

export function StationsRow() {
  const a = useApp((x) => x);
  const activeCount = cats.activeStations(a.folded.records.station).length;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Opt t="Stations" sub="Names, icons, colours and active toggle" value={`${String(activeCount)} active`} onClick={() => { setOpen(true); }} />
      {open ? <StationsSheet onClose={() => { setOpen(false); }} /> : null}
    </>
  );
}
