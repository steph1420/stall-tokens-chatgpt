// F-21 Station Overview (Q-STN-LOOK D): item totals still to make, status split, look picker, auto-prep (Q-AUTOPREP).
import { kitchen, liveOrders, useApp, type DevicePrefs } from '../../store';
import { Sheet } from '../kit/Sheet';
import { StatusMark, type Mark } from '../kitchen/StatusMark';
import kit from '../kit/kit.module.css';
import s from './Station.module.css';

const LOOKS: readonly { id: DevicePrefs['stationLook']; label: string }[] = [
  { id: 'full', label: 'Full card' }, { id: 'items', label: 'Item cards' }, { id: 'ticket', label: 'Ticket' },
];
const SPLIT = ['waiting', 'preparing', 'held', 'paused', 'done?', 'ready'] as const satisfies readonly Mark[];

function AutoPrepSection({ autoPrep, delaySec, onSet }: { autoPrep: boolean; delaySec: number; onSet: (patch: Partial<DevicePrefs>) => void }) {
  return (
    <>
      <div className={kit.fieldLab}>Next order</div>
      <div className={kit.choiceRow} role="radiogroup" aria-label="Auto-prep">
        <button type="button" role="radio" aria-checked={autoPrep} className={autoPrep ? kit.choiceOn : kit.choice} onClick={() => { onSet({ autoPrep: true }); }}>Start it for me</button>
        <button type="button" role="radio" aria-checked={!autoPrep} className={!autoPrep ? kit.choiceOn : kit.choice} onClick={() => { onSet({ autoPrep: false }); }}>I'll start it</button>
      </div>
      {autoPrep ? (
        <>
          <div className={kit.fieldLab}>Switch delay</div>
          <div className={kit.choiceRow} role="radiogroup" aria-label="Next order switch delay">
            {[0, 1, 2, 3, 5].map((sec) => (
              <button type="button" role="radio" key={sec} aria-checked={delaySec === sec} className={delaySec === sec ? kit.choiceOn : kit.choice} onClick={() => { onSet({ nextOrderDelaySec: sec }); }}>{sec === 0 ? '0s' : `${String(sec)}s`}</button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export function Overview({ station }: { station: string }) {
  const folded = useApp((st) => st.folded);
  const prefs = useApp((st) => st.prefs);
  const setPrefs = useApp((st) => st.setPrefs);
  const close = useApp((st) => st.openSheet);
  const ov = kitchen.overview(liveOrders(folded), station);
  return (
    <Sheet title={`${station} overview`} onClose={() => { close(null); }}>
      <div className={kit.fieldLab}>Still to make</div>
      <ul className={s.ovItems}>
        {ov.items.length === 0 ? <li className={s.ovNone}>Nothing waiting</li> : null}
        {ov.items.map((i) => <li key={i.name}><b>{i.qty}</b><span>{i.name}</span></li>)}
      </ul>
      <div className={s.ovSplit}>
        {SPLIT.filter((m) => (ov.split[m] ?? 0) > 0).map((m) => (
          <span key={m} className={s.ovChip}><StatusMark mark={m} /><b>{ov.split[m]}</b></span>
        ))}
      </div>
      <div className={kit.fieldLab}>Look</div>
      <div className={kit.choiceRow} role="radiogroup" aria-label="Station look">
        {LOOKS.map((l) => (
          <button type="button" role="radio" aria-checked={prefs.stationLook === l.id} key={l.id}
            className={prefs.stationLook === l.id ? kit.choiceOn : kit.choice} onClick={() => { setPrefs({ stationLook: l.id }); }}>{l.label}</button>
        ))}
      </div>
      <AutoPrepSection autoPrep={prefs.autoPrep} delaySec={prefs.nextOrderDelaySec} onSet={setPrefs} />
    </Sheet>
  );
}
