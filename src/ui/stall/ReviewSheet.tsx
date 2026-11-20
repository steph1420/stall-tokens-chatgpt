// Q-HARM-10 Sync > Review: clashes the fold resolved (newest first). Shows what was kept and the other value; "Use
// this instead" writes a new op with the other value. Read-only otherwise; sync never waits on this list.
import type { Conflict } from '../../contract';
import { istClock, useApp } from '../../store';
import { Sheet } from '../kit/Sheet';
import kit from '../kit/kit.module.css';
import s from './Stall.module.css';

const who = (w: string) => (w === 'sheet' ? 'Sheet edit' : w ? `Phone ${w.slice(0, 4)}` : 'unknown');
const what = (c: Conflict) => `${c.target.replace(/^rec:/, '').replace(/:/g, ' · ')} · ${c.field}`;

function Row({ c }: { c: Conflict }) {
  const a = useApp((x) => x.conflicts);
  const d = a.sides(c);
  return (
    <li className={s.reviewRow}>
      <span className={s.rowMain}>
        <span className={s.setT}>{what(c)}</span>
        <span className={s.rowS}>{`${istClock(c.at)} · kept “${d.kept}” (${who(d.keptBy)}${c.rule === 'sheet-wins' ? ', sheet wins' : ''}) · other “${d.other}” (${who(d.otherBy)})`}</span>
      </span>
      <button type="button" className={kit.quiet} onClick={() => { a.flip(c); }}>Use this instead</button>
    </li>
  );
}

export function ReviewSheet({ onClose }: { onClose: () => void }) {
  const cs = useApp((x) => x.folded.conflicts);
  return (
    <Sheet title={`Review clashes (${String(cs.length)})`} onClose={onClose}>
      {cs.length === 0 ? <p className={s.syncHint}>No clashes. When two phones (or a phone and the Sheet) change the same thing without seeing each other, it shows here.</p> : null}
      <ul className={s.reviewList}>{[...cs].reverse().slice(0, 50).map((c) => <Row key={`${c.winner}>${c.loser}|${c.field}`} c={c} />)}</ul>
    </Sheet>
  );
}
