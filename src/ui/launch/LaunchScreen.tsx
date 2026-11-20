// F-04 Launch (21-polish2/launch.html): shown every time the app opens (Q-LAUNCH-1 B). Section 1 Counter, Kitchen;
// section 2 the stations (working names, CONFIG.stations, Q-KITCHEN-2 C); section 3 the quiet Stall list (D-NAV).
import { useApp } from '../../store';
import { Icon } from '../kit/Icon';
import { STATIONS, stationIcon } from '../kitchen/stations';
import { StallNav } from '../stall/StallNav';
import s from './LaunchScreen.module.css';

export function LaunchScreen() {
  const go = useApp((st) => st.go);
  const k = useApp((st) => st.kitchen);
  const stallName = useApp((st) => st.folded.settings.stallName ?? 'Fair stall');
  return (
    <div className={s.page}>
      <header className={s.kicker}>{stallName}</header>
      <main className={s.content}>
        <section className={s.roles}>
          <button type="button" className={s.choice} onClick={() => { go('counter'); }}>
            <span className={s.name}>Counter</span><span className={s.hint}>Menu, billing and payment</span>
          </button>
          <button type="button" className={s.choice} onClick={() => { k.openKitchen(); }}>
            <span className={s.name}>Kitchen</span><span className={s.hint}>Orders by station</span>
          </button>
        </section>
        <section className={s.stations}>
          <div className={s.label}>Stations</div>
          <div className={s.grid}>
            {STATIONS.map((name, i) => (
              <button type="button" key={name} className={s.tile} style={{ '--c': `var(--dl-stall-station-${String(i)})` } as React.CSSProperties} onClick={() => { k.openStation(name, 'launch'); }}>
                <Icon name={stationIcon(name)} className={s.icon} /><span>{name}</span>
              </button>
            ))}
          </div>
        </section>
        <section className={s.stations}>
          <div className={s.label}>Stall</div>
          <StallNav className={s.stall} />
        </section>
      </main>
    </div>
  );
}
