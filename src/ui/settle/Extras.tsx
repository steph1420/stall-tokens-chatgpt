// F-47 Settle-up extras (Q-SETTLE-EXTRAS C, owner pt29u): split type (Share % / Exact ₹), fewest transfers (simplify
// debts) and a shareable settle-up receipt. All shared through `setting.set`; sharing uses the phone's own share sheet.
import { formatInr } from '../../contract';
import { istDay, settle, useApp, type Split } from '../../store';
import { shareText } from '../kit/share';
import st from '../stall/Stall.module.css';
import s from './Settle.module.css';

export function SplitType({ sp }: { sp: Split }) {
  const a = useApp((x) => x.settle);
  const opt = (m: settle.SplitMode, label: string) => <button type="button" role="radio" aria-checked={sp.mode === m} className={sp.mode === m ? s.segOn : s.segBtn} onClick={() => { a.setSplitMode(m); }}>{label}</button>;
  return (
    <>
      <div className={s.seg} role="radiogroup" aria-label="Split type">{opt('share', 'Share %')}{opt('exact', 'Exact ₹')}</div>
      {sp.mode === 'exact' ? <p className={s.inhand}>{sp.exactLeft === 0 ? 'Exact amounts add up' : `${formatInr(Math.abs(sp.exactLeft))} ${sp.exactLeft > 0 ? 'left to give out' : 'too much given out'}`}</p> : null}
    </>
  );
}

function useNames() {
  const people = useApp((x) => x.folded.people);
  return (id: string) => (id === 'stall' ? 'Stall cash' : people[id]?.name ?? 'Someone');
}

export function FewestTransfers({ sp }: { sp: Split }) {
  const name = useNames();
  const xs = settle.fewestTransfers(settle.settleNets(sp));
  if (!xs.length) return null;
  return (
    <section aria-label="Fewest transfers">
      <div className={s.step}><span className={s.n2}>⇄</span><b>Fewest transfers</b><small>{`${String(xs.length)} to square up`}</small></div>
      <ul className={s.hist}>{xs.map((x) => <li key={`${x.from}>${x.to}`}><span>{`${name(x.from)} → ${name(x.to)}`}</span><b>{formatInr(x.amount)}</b></li>)}</ul>
    </section>
  );
}

/** Plain-text settle-up receipt for WhatsApp / SMS via the share sheet. */
export function ShareSettle({ sp }: { sp: Split }) {
  const name = useApp((x) => x.folded.settings.stallName ?? 'Fair stall');
  const at = useApp((x) => x.folded.days[x.folded.days.length - 1]?.label ?? istDay(Date.now()));
  const toast = useApp((x) => x.money.toast);
  const who = useNames();
  const text = [`${name} · settle up ${at}`, `In hand ${formatInr(sp.inHand)}`,
    ...sp.others.map((o) => `${o.person.name}: ${o.owed >= 0 ? 'repay' : 'pays back'} ${formatInr(Math.abs(o.owed))}`),
    ...sp.partners.map((p) => `${p.person.name} (${sp.mode === 'exact' ? 'exact' : `${String(p.person.sharePct)}%`}): ${formatInr(p.share)}`),
    ...settle.fewestTransfers(settle.settleNets(sp)).map((x) => `→ ${who(x.from)} pays ${who(x.to)} ${formatInr(x.amount)}`)].join('\n');
  const go = () => { void shareText('Settle up', text).then((r) => { if (r !== 'shared') toast(r === 'copied' ? 'Settle-up copied' : 'Could not share'); }); };
  return <button type="button" className={st.small} onClick={go}>Share receipt</button>;
}
