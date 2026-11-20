// F-26 / F-27 / F-29 Settlement (21-polish2/settle.html, partners.html; Q-NEXT-2 A). Two screens: Settle up (1 Repay others,
// 2 Split between partners, dimmed until step 1 is done; Repay all) and Partners (pending warning, shares, Split anyway, lock / reopen).
import { useState } from 'react';
import { formatInr, type Person } from '../../contract';
import { liveOrders, settle, useApp, type Split } from '../../store';
import { Money } from '../kit/Money';
import { StallPage } from '../stall/StallPage';
import st from '../stall/Stall.module.css';
import { FewestTransfers, ShareSettle, SplitType } from './Extras';
import { PersonSheet } from './PersonSheet';
import s from './Settle.module.css';

const av = (i: number) => ({ '--c': `var(--dl-stall-station-${String(i % 6)})` }) as React.CSSProperties;

function Row({ p, i, sub, amount, onPay, dim }: { p: Person; i: number; sub: string; amount: number; onPay?: () => void; dim?: boolean }) {
  return (
    <div className={[s.prow, dim ? s.dim : ''].join(' ')}>
      <span className={st.avatar} style={av(i)}>{p.name.slice(0, 1).toUpperCase()}</span>
      <span className={st.rowMain}><span className={st.rowT}>{p.name}</span><span className={st.rowS}>{sub}</span></span>
      <Money p={Math.abs(amount)} className={[s.pamt, onPay ? s.owe : amount < 0 ? s.payIn : s.get].join(' ')} />
      {onPay ? <button type="button" className={st.smallGo} onClick={onPay}>{amount < 0 ? 'Take back' : 'Pay'}</button> : null}
    </div>
  );
}

function SettleUp({ sp, open }: { sp: Split; open: (id: string) => void }) {
  const left = sp.others.reduce((t, o) => t + Math.max(0, o.owed), 0);
  const f = useApp((x) => x.folded);
  return (
    <>
      <p className={s.inhand}>{`Stall in hand ${formatInr(sp.inHand)}`}</p>
      <div className={s.step}><span className={s.n}>1</span><b>Repay others</b><small>{left ? `${formatInr(left)} left` : 'done'}</small></div>
      {sp.others.length === 0 ? <p className={st.empty}>Nobody else to repay.</p> : null}
      {sp.others.map((o, i) => <Row key={o.person.id} p={o.person} i={i} amount={o.owed} sub={settle.balanceWhy(f, o.person.id).labels.join(', ') || 'Balance'} onPay={() => { open(o.person.id); }} />)}
      <div className={[s.step, sp.others.length ? s.dim : ''].join(' ')}><span className={s.n2}>2</span><b>Split between partners</b><small>after step 1</small></div>
      {sp.partners.map((x, i) => <Row key={x.person.id} p={x.person} i={i + 3} amount={x.share} dim={sp.others.length > 0} sub={`${sp.mode === 'exact' ? 'Exact' : `${String(x.person.sharePct)}%`}${x.owed ? ` · incl. ${formatInr(x.owed)} paid` : ''}`} />)}
      <FewestTransfers sp={sp} />
      <div className={s.shareRow}><ShareSettle sp={sp} /></div>
    </>
  );
}

function Partners({ sp, open }: { sp: Split; open: (id: string) => void }) {
  const people = useApp((x) => x.folded.people);
  const pending = sp.others.filter((o) => o.owed !== 0);
  return (
    <>
      {pending.length ? (
        <div className={s.warnBox} role="status"><span aria-hidden="true">⚠️</span>
          <span className={st.rowMain}><b>{`${String(pending.length)} repayment${pending.length > 1 ? 's' : ''} still pending`}</b><small>{`${pending.map((o) => `${o.person.name} ${formatInr(o.owed)}`).join(', ')} · split may change`}</small></span>
          <button type="button" className={s.review} onClick={() => { open(pending[0]?.person.id ?? ''); }}>Review ›</button></div>
      ) : null}
      <SplitType sp={sp} />
      <p className={s.inhand}>{`To split ${formatInr(sp.toSplit)}`}{sp.sharesOk || sp.mode === 'exact' ? '' : ' · shares must add up to 100%'}</p>
      {sp.partners.map((x, i) => (
        <div key={x.person.id} className={s.pcard}>
          <Row p={x.person} i={i + 3} amount={x.share} sub={[sp.mode === 'exact' ? 'Exact' : `${String(x.person.sharePct)}%`, ...x.covering.map((c) => `incl. ${people[c.personId]?.name ?? 'someone'} ${formatInr(c.amount)}`)].join(' · ')} />
          {x.covering.map((c) => <p key={c.personId} className={s.cover}>{`🤝 Covering ${people[c.personId]?.name ?? 'someone'}'s ${formatInr(c.amount)} · added back`}</p>)}
          <ShareInput sp={sp} id={x.person.id} name={x.person.name} pct={x.person.sharePct} />
        </div>
      ))}
      <AddPartner />
    </>
  );
}

function ShareInput({ sp, id, name, pct }: { sp: Split; id: string; name: string; pct: number }) {
  const a = useApp((x) => x.settle);
  const exact = useApp((x) => settle.exactOf(x.folded.settings, id));
  if (sp.mode === 'exact') {
    return <label className={s.share}>Exact ₹<input key="exact" inputMode="decimal" aria-label={`${name} exact amount`} defaultValue={String(exact / 100)} onBlur={(e) => { a.setExact(id, Math.round((Number(e.target.value) || 0) * 100)); }} /></label>;
  }
  return <label className={s.share}>Share %<input key="pct" inputMode="numeric" aria-label={`${name} share`} defaultValue={String(pct)} onBlur={(e) => { a.setPartner(id, true, Number(e.target.value) || 0); }} /></label>;
}

function AddPartner() {
  const people = useApp((x) => Object.values(x.folded.people).filter((p) => !p.isPartner));
  const a = useApp((x) => x.settle);
  const m = useApp((x) => x.money);
  const [name, setName] = useState('');
  const add = () => { const id = people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())?.id ?? m.savePerson(null, name); if (id) { a.setPartner(id, true, 0); setName(''); } };
  return (
    <div className={s.addP}><input aria-label="Add a partner" placeholder="Add a partner…" value={name} onChange={(e) => { setName(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
      <button type="button" className={st.small} onClick={add}>Add</button></div>
  );
}

export function SettleScreen() {
  const f = useApp((x) => x.folded);
  const a = useApp((x) => x.settle);
  const [tab, setTab] = useState<'settle' | 'partners'>('settle');
  const [person, setPerson] = useState<string | null>(null);
  const dayId = f.days[f.days.length - 1]?.id ?? '';
  const sp = settle.split(f, liveOrders(f), dayId);
  const lock = f.locks[dayId];
  const owed = sp.others.reduce((t, o) => t + Math.max(0, o.owed), 0);
  const bar = lock?.locked ? <button type="button" className={s.quietBar} onClick={() => { a.reopenDay(); }}>Day locked · Reopen</button>
    : tab === 'settle' ? <button type="button" className={s.goBar} disabled={owed === 0} onClick={() => { a.repayAll(); }}>{owed ? `Repay all ${formatInr(owed)}` : 'All repaid'}</button>
      : <button type="button" className={sp.others.length ? s.goBarDim : s.goBar} onClick={() => { a.lockDay(); }}>{sp.others.length ? 'Split anyway' : 'Split and lock the day'}</button>;
  return (
    <StallPage title={tab === 'settle' ? 'Settle up' : 'Settlement'} right={<span className={s.today}>Today</span>} bar={bar}>
      <div className={s.seg} role="tablist" aria-label="Settlement">
        <button type="button" role="tab" aria-selected={tab === 'settle'} className={tab === 'settle' ? s.segOn : s.segBtn} onClick={() => { setTab('settle'); }}>Settle up</button>
        <button type="button" role="tab" aria-selected={tab === 'partners'} className={tab === 'partners' ? s.segOn : s.segBtn} onClick={() => { setTab('partners'); }}>Partners</button>
      </div>
      {tab === 'settle' ? <SettleUp sp={sp} open={setPerson} /> : <Partners sp={sp} open={setPerson} />}
      {person ? <PersonSheet key={person} personId={person} onClose={() => { setPerson(null); }} /> : null}
    </StallPage>
  );
}
