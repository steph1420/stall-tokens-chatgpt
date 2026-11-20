// F-14..F-17, F-62, F-63 Payment (20-polish/payment.html p1; pay2: + Tip / − Waive; pay3: split lock + calculator). Manual UPI confirm (Q-UPI-1 A).
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../../config';
import type { Order, Paise } from '../../../contract';
import { bill, formatToken, pay, upiLink, upiQrFacts, useApp } from '../../../store';
import { buzz } from '../../kit/haptics';
import { Icon } from '../../kit/Icon';
import { Money } from '../../kit/Money';
import { Qr } from '../../kit/Qr';
import { Sheet } from '../../kit/Sheet';
import k from '../../kit/kit.module.css';
import { Numpad } from './Numpad';
import { CalcSheet } from './CalcSheet';
import { AdjustRow, CountNotesDrawer, MethodSeg, type PayMethod } from './parts';
import s from './Payment.module.css';

type Box = 'cash' | 'upi' | 'tip' | 'waive';
const R = CONFIG.money.paisePerRupee;

function Slider({ split, covered, onSlide, locked }: { split: pay.Split; covered: Paise; onSlide: (f: number) => void; locked: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const f = covered > 0 ? split.cash / covered : 0;
  const upiF = covered > 0 ? split.upi / covered : 0;
  const move = (x: number) => { const r = ref.current?.getBoundingClientRect(); if (r && r.width > 0) onSlide(1 - (x - r.left) / r.width); }; // D-SLIDE-1: dragging right gives more to UPI
  const step = CONFIG.money.sliderSnapPaise / Math.max(covered, 1);
  return (
    <>
      {/* D-PAY3-2: while a side is locked the slider rests (dimmed, not draggable); the lock says why. */}
      <div className={locked ? s.trackLocked : s.track} ref={ref} role="slider" tabIndex={locked ? -1 : 0} aria-label="Cash and UPI split" aria-disabled={locked || undefined}
        aria-valuemin={0} aria-valuemax={covered / R} aria-valuenow={split.upi / R} aria-valuetext={`UPI ₹${(split.upi / R).toLocaleString('en-IN')}, Cash ₹${(split.cash / R).toLocaleString('en-IN')}`}
        onPointerDown={(e) => { if (locked) return; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => { if (!locked && e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX); }}
        onKeyDown={(e) => { if (locked) return; if (e.key === 'ArrowLeft') onSlide(f + step); if (e.key === 'ArrowRight') onSlide(f - step); }}>
        <div className={s.trackIn}>
          <div className={s.fillUpi} style={{ width: `${String(upiF * 100)}%` }} />
          <div className={s.fillCash} style={{ left: `${String(upiF * 100)}%`, width: `${String(f * 100)}%` }} />
        </div>
        <div className={s.thumb} style={{ left: `${String(upiF * 100)}%` }} />
      </div>
      <div className={s.ticks} aria-hidden="true">{Array.from({ length: 19 }, (_, i) => <i key={i} className={i % 5 === 0 || i === 18 ? s.maj : undefined} />)}</div>
      <div className={s.tickLabs} aria-hidden="true">
        <span className={s.t0}>₹0</span>
        {upiF > CONFIG.payment.sliderLabelEdge && upiF < 1 - CONFIG.payment.sliderLabelEdge ? <span className={s.tMid} style={{ left: `${String(upiF * 100)}%` }}>{`₹${(split.upi / R).toLocaleString('en-IN')}`}</span> : null}
        <span className={s.tEnd}>{`₹${(covered / R).toLocaleString('en-IN')}`}</span>
      </div>
    </>
  );
}

function Settled({ o }: { o: Order }) {
  const c = useApp((st) => st.counter);
  const openSheet = useApp((st) => st.openSheet);
  const t = bill.tips(o);
  const w = bill.waived(o);
  return (
    <>
      <main className={s.stage}>
        <div className={s.due}>
          <div className={s.dueLab}>{formatToken(o.token, CONFIG.tokens.pad)} · {bill.due(o) < 0 ? 'Refund owed' : 'Paid'}</div>
          <Money p={bill.due(o) < 0 ? -bill.due(o) : bill.paid(o) + t} className={s.dueAmt} />
          {t > 0 || w > 0 ? (
            <div className={s.tipNote}>
              {t > 0 ? <span>incl. <Money p={t} /> tip</span> : null}
              {t > 0 && w > 0 ? <span> · </span> : null}
              {w > 0 ? <span>incl. <Money p={w} /> waived</span> : null}
            </div>
          ) : null}
          <div className={s.settledBtns}>
            <button type="button" className={s.printBtn} onClick={() => { openSheet({ kind: 'slip', orderId: o.id }); }}>Print token</button>
            <button type="button" className={s.printBtn} onClick={() => { openSheet({ kind: 'slip', orderId: o.id }); }}>Print bill</button>
          </div>
        </div>
      </main>
      <footer className={s.bar}>
        <button type="button" className={s.back} onClick={() => { c.setPage('billing'); }}><Icon name="backSmall" className={s.ic} />Back</button>
        <span className={s.paid}>{bill.due(o) < 0 ? '' : 'Paid ✓'}</span>
        <button type="button" className={s.confirm} onClick={() => { c.newOrder(); }}>New order</button>
      </footer>
    </>
  );
}

/** A ₹0 order (free items or a full discount): nothing to collect, so offer To kitchen instead of a stuck Confirm. */
function NothingDue({ o }: { o: Order }) {
  const c = useApp((st) => st.counter);
  const unsent = o.lines.some((l) => l.status === 'draft' && l.qty > 0);
  return (
    <>
      <main className={s.stage}>
        <div className={s.due}>
          <div className={s.dueLab}>{formatToken(o.token, CONFIG.tokens.pad)} · Nothing to collect</div>
          <Money p={0} className={s.dueAmt} />
        </div>
      </main>
      <footer className={s.bar}>
        <button type="button" className={s.back} onClick={() => { c.setPage('billing'); }}><Icon name="backSmall" className={s.ic} />Back</button>
        <span className={s.paid} />
        {unsent
          ? <button type="button" className={s.confirm} onClick={() => { c.sendToKitchen(); }}>To kitchen</button>
          : <button type="button" className={s.confirm} onClick={() => { c.newOrder(); }}>New order</button>}
      </footer>
    </>
  );
}

const initSplit = (due0: Paise, t: Paise, w: Paise): pay.Split =>
  ({ cash: Math.max(0, Math.max(0, due0) + t - w), upi: 0, pinned: null, waived: w, locked: null });

function handleTyped(cur: pay.Split, box: Box, rupees: number, toCollect: Paise, owed: Paise, tip: Paise, setTipTo: (t: Paise) => void) {
  if (box === 'tip') { setTipTo(rupees * R); return null; }
  if (box === 'waive') { const next = pay.setWaived(cur, rupees * R, toCollect, tip); return { split: next, tip, waived: next.waived ?? 0 }; }
  if (cur.locked && cur.locked !== box) { const res = pay.changeUnlocked(cur, box, rupees * R, owed); return { split: res.split, tip: res.tip, waived: res.waived }; }
  return { split: pay.setBox(cur, box, rupees * R, toCollect), tip, waived: cur.waived ?? 0 };
}

/** The payment draft is local to this screen (never in the log until Confirm). */
function useDraft(o: Order | undefined) {
  const c = useApp((st) => st.counter);
  const draftInit = useApp((st) => (o ? st.ui.payDrafts?.[o.id] : undefined));
  const initTip = draftInit?.tip ?? 0; const initWaived = draftInit?.waived ?? 0; const due0 = o ? bill.due(o) : 0;
  const [tip, setTip] = useState<Paise>(initTip);
  const [split, setSplit] = useState<pay.Split>(() => initSplit(due0, initTip, initWaived));
  const [notes, setNotes] = useState<Record<string, number>>({});
  const [waiver, setWaiver] = useState({ by: draftInit?.waivedBy ?? '', note: draftInit?.waivedNote ?? '' });
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const owed = o ? bill.due(o) : 0; const toCollect = Math.max(0, owed) + tip; const cur = pay.refit(split, toCollect);
  const syncDraft = (t: Paise, w: Paise) => { if (o) c.setPayDraft(o.id, { tip: t, waived: w, waivedBy: waiver.by, waivedNote: waiver.note }); };
  const setTipTo = (t: Paise) => { setTip(t); setSplit(pay.addTip(cur, t - tip, Math.max(0, owed) + t)); syncDraft(t, cur.waived ?? 0); };
  const typed = (box: Box, rupees: number) => {
    const res = handleTyped(cur, box, rupees, toCollect, owed, tip, setTipTo);
    if (res) { setTip(res.tip); setSplit(res.split); syncDraft(res.tip, res.waived); }
  };
  const setBoth = (t: Paise, w: Paise): boolean => {
    const next = pay.setWaived(pay.addTip(cur, t - tip, Math.max(0, owed) + t), w, Math.max(0, owed) + t, t);
    setTip(t); setSplit(next); syncDraft(t, w);
    return pay.lockClamped(cur, next);
  };
  useUndo(o?.id, setBoth);
  return { tip, setTipTo, setBoth, cur, setSplit, notes, setNotes, waiver, setWaiver, payeeId, setPayeeId,
    owed, toCollect, typed, waived: cur.waived ?? 0, check: pay.checkPayment(cur.cash, cur.upi, toCollect, tip, cur.waived ?? 0) };
}

/** pay2: the toast's Undo (+ Tip / − Waive) puts the old amounts back. */
function useUndo(orderId: string | undefined, setBoth: (t: Paise, w: Paise) => boolean) {
  const u = useApp((st) => st.ui.payUndo);
  const seen = useRef(u?.seq ?? 0);
  useEffect(() => {
    if (!u || u.seq === seen.current) return;
    seen.current = u.seq;
    if (u.orderId === orderId) setBoth(u.tip, u.waived); // the old amounts come back; a lock stays as it is
  }, [u, orderId, setBoth]);
}
type Draft = ReturnType<typeof useDraft>;

/** pay3: each side has a padlock. A locked side never changes by itself; the other is freely changeable. */
function SideBox({ d, side, on, onPad }: { d: Draft; side: pay.Side; on: boolean; onPad: () => void }) {
  const lk = d.cur.locked ?? null;
  const label = side === 'cash' ? 'Cash' : 'UPI';
  const follows = lk !== null && lk !== side;
  const tap = () => { onPad(); };
  const cls = side === 'cash' ? (on ? s.boxCashOn : s.boxCash) : (on ? s.boxUpiOn : s.boxUpi);
  const showRest = follows && d.tip === 0 && d.waived === 0;
  return (
    <div className={lk === side ? [cls, s.boxLocked].join(' ') : cls}>
      <button type="button" className={s.boxTap} aria-label={`${label} ₹${String(d.cur[side] / R)}${showRest ? ', the rest' : ''}`} onClick={tap}>
        <span className={side === 'cash' ? s.labCash : s.labUpi}>{label}{showRest ? <em className={s.rest}> · the rest</em> : null}</span>
        <Money p={d.cur[side]} className={on ? s.valOn : s.val} />
      </button>
      <button type="button" className={lk === side ? s.lockOn : s.lock} aria-pressed={lk === side} aria-label={lk === side ? `Unlock ${label}` : `Lock ${label}`}
        onClick={() => { d.setSplit(pay.toggleLock(d.cur, side)); }}><Icon name={lk === side ? 'lock' : 'unlock'} /></button>
    </div>
  );
}

function SplitBoxes({ d, pad, setPad }: { d: Draft; pad: Box | null; setPad: (b: Box) => void }) {
  return (
    <div className={s.split}>
      <SideBox d={d} side="cash" on={pad === 'cash'} onPad={() => { setPad('cash'); }} />
      <SideBox d={d} side="upi" on={pad === 'upi'} onPad={() => { setPad('upi'); }} />
    </div>
  );
}

function QrBlock({ d, o }: { d: Draft; o: Order }) {
  const payees = useApp((st) => Object.values(st.folded.payees));
  const stallName = useApp((st) => st.folded.settings.stallName ?? 'Fair stall');
  const openSheet = useApp((st) => st.openSheet);
  const payee = payees.find((p) => p.id === d.payeeId) ?? payees[0];
  const upi = d.cur.upi;
  if (upi <= 0) return null;
  const note = `${stallName} ${formatToken(o.token, CONFIG.tokens.pad)}`.slice(0, CONFIG.payment.upiNoteMaxChars);
  // Single source: the same link the QR encodes; the label is parsed back from pa= and am=.
  const link = payee ? upiLink(payee.upiId, payee.name, upi, note) : '';
  const facts = link ? upiQrFacts(link) : null;
  return (
    <div className={s.qrBlock}>
      <div className={s.qrMeta}>
        <button type="button" className={s.qrWho} onClick={() => { openSheet({ kind: 'payee' }); }}>{payee ? payee.name : 'Add a UPI ID'} <Icon name="chevron" className={s.chev} /></button>
        {facts ? (
          <div className={s.qrFacts} role="group" aria-label="UPI ID and amount on this QR">
            <span className={s.qrId} title={facts.upiId}>{facts.upiId}</span>
            <span className={s.qrAmt}>{facts.amountText}</span>
          </div>
        ) : null}
      </div>
      {payee && facts ? <div className={s.qrTile}><Qr text={link} label={`Payment QR, ${facts.amountText}, ${facts.upiId}`} /></div> : null}
      {payees.length > 1 ? <div className={s.payeePick}>{payees.map((p) => <button type="button" key={p.id} className={p.id === payee?.id ? s.payeeOn : s.payee} onClick={() => { d.setPayeeId(p.id); }}>{p.name}</button>)}</div> : null}
    </div>
  );
}

function useConfirm(d: Draft) {
  const c = useApp((st) => st.counter);
  const haptics = useApp((st) => st.prefs.haptics);
  const payees = useApp((st) => Object.values(st.folded.payees));
  const busy = useRef(false);
  return () => {
    if (busy.current) return; // double tap guard; the store also refuses a second payment
    busy.current = true;
    const payee = payees.find((p) => p.id === d.payeeId) ?? payees[0];
    const g = d.waived; // only the explicit − Waive amount, never a leftover gap
    const err = c.pay({ cash: d.cur.cash, upi: d.cur.upi, upiPayeeId: d.cur.upi > 0 ? payee?.id ?? null : null, tip: d.tip, waived: g,
      waivedBy: g > 0 ? d.waiver.by : '', waivedNote: g > 0 ? d.waiver.note : '', cashGiven: pay.notesTotal(d.notes), notes: d.notes });
    busy.current = false;
    if (err) { c.toast(err); buzz(haptics, 'error'); return; }
    buzz(haptics, 'confirm');
  };
}

function padRupees(pad: Box, d: Draft): number {
  if (pad === 'tip') return d.tip / R;
  if (pad === 'waive') return d.waived / R;
  return d.cur[pad] / R;
}

/** pay2: + Tip / − Waive change the amount due (with an Undo toast); any problem shows under them. */
function Adjust({ d, onOther }: { d: Draft; onOther: (k: 'tip' | 'waive') => void }) {
  const openSheet = useApp((st) => st.openSheet);
  const c = useApp((st) => st.counter);
  const pick = (k: 'tip' | 'waive', p: Paise) => {
    const prev = { tip: d.tip, waived: d.waived };
    const clamped = k === 'tip' ? d.setBoth(p, d.waived) : d.setBoth(d.tip, Math.min(p, Math.max(0, d.owed)));
    const r = (x: Paise) => `₹${String(x / R)}`;
    const said = k === 'tip' ? (p > 0 ? `Tip ${r(p)} added` : 'Tip removed') : (p > 0 ? `Waived ${r(Math.min(p, Math.max(0, d.owed)))}` : 'Waive removed');
    // pay3: a locked side above the new amount comes down to it; say so calmly in the same toast.
    c.adjustToast(clamped ? `${said} · ${d.cur.locked === 'upi' ? 'UPI' : 'Cash'} lowered to fit` : said, prev);
  };
  const by = d.waiver.by.trim();
  const reason = d.waiver.note.trim();
  const who = by || 'Choose';
  const label = d.waived > 0 ? `₹${String(d.waived / R)} waived · Allowed by ${who}${reason ? ` · ${reason}` : ''}` : '';
  return (
    <>
      <AdjustRow tip={d.tip} waived={d.waived} onPick={pick} onOther={onOther} />
      {d.waived > 0 ? (
        <button type="button" className={s.waiveNote} aria-label={label} onClick={() => { openSheet({ kind: 'waived' }); }}>
          <Money p={d.waived} /> waived · Allowed by <em>{who}</em>{reason ? <> · {reason}</> : null} <Icon name="chevron" className={s.chev} />
        </button>
      ) : null}
      {!d.check.ok && d.toCollect > 0 ? <div className={s.over} role="alert">{d.check.reason}</div> : null}
    </>
  );
}

function DueHead({ method, dueNow, tip, waived, owed, onCalc, onPrint }: {
  method: PayMethod | null; dueNow: Paise; tip: Paise; waived: Paise; owed: Paise; onCalc: () => void; onPrint: () => void;
}) {
  return (
    <div className={s.due}>
      <button type="button" className={s.printBillBtn} aria-label="Print bill" title="Print bill" onClick={onPrint}>
        <Icon name="printer" /><span className={s.printBillText}>Print bill</span>
      </button>
      {method === 'split' ? <button type="button" className={s.calcBtn} aria-label="Calculator" onClick={onCalc}><Icon name="calc" /></button> : null}
      <div className={s.dueLab}>To collect</div>
      <Money p={dueNow} className={s.dueAmt} />
      {tip > 0 || waived > 0 ? <div className={s.tipNote}>bill <Money p={Math.max(0, owed)} />{tip > 0 ? <> · tip +<Money p={tip} /></> : null}{waived > 0 ? <> · waived −<Money p={waived} /></> : null}</div> : null}
    </div>
  );
}

function MethodTools({ method, adjOn, d, pad, setPad, setShowAdj }: { method: PayMethod | null; adjOn: boolean; d: Draft; pad: Box | null; setPad: (b: Box) => void; setShowAdj: (v: boolean) => void }) {
  if (method === 'cash' || method === 'upi') {
    return adjOn ? <Adjust d={d} onOther={(k2) => { setPad(k2); }} /> : <button type="button" className={s.moreAdj} onClick={() => { setShowAdj(true); }}>Tip or waive</button>;
  }
  if (method !== 'split') return null;
  const cur = d.cur;
  return (
    <>
      <SplitBoxes d={d} pad={pad} setPad={setPad} />
      <Slider split={cur} covered={cur.cash + cur.upi} locked={!!cur.locked} onSlide={(f) => { d.setSplit(pay.slide(f, cur.cash + cur.upi, CONFIG.money.sliderSnapPaise, d.waived)); }} />
      <Adjust d={d} onOther={(k2) => { setPad(k2); }} />
    </>
  );
}

function PayOpen({ o, d }: { o: Order; d: Draft }) {
  const c = useApp((st) => st.counter);
  const openSheet = useApp((st) => st.openSheet);
  const notesOpen = useApp((st) => st.prefs.countNotesOpen);
  const setPrefs = useApp((st) => st.setPrefs);
  const confirm = useConfirm(d);
  const [pad, setPad] = useState<Box | null>(null);
  const [calc, setCalc] = useState(false);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [showAdj, setShowAdj] = useState(false);
  const dueNow = d.toCollect - d.waived;
  const pickMethod = (m: PayMethod) => {
    if (m === 'cash' || m === 'upi') d.setSplit({ ...pay.setBox({ ...d.cur, locked: null }, m, d.toCollect, d.toCollect), locked: null, pinned: m });
    setMethod(m);
  };
  const printBill = () => { openSheet({ kind: 'slip', orderId: o.id, tip: d.tip, waived: d.waived }); };
  const adjOn = method === 'split' || showAdj || d.tip > 0 || d.waived > 0;
  return (
    <>
      <main className={s.stage}>
        <div className={s.body}>
          <DueHead method={method} dueNow={dueNow} tip={d.tip} waived={d.waived} owed={d.owed} onCalc={() => { setCalc(true); }} onPrint={printBill} />
          <MethodSeg method={method} due={dueNow} onPick={pickMethod} />
          <MethodTools method={method} adjOn={adjOn} d={d} pad={pad} setPad={setPad} setShowAdj={setShowAdj} />
          <QrBlock d={d} o={o} />
          {method && d.cur.cash > 0 ? <CountNotesDrawer notes={d.notes} onNotes={d.setNotes} open={notesOpen} onToggle={() => { setPrefs({ countNotesOpen: !notesOpen }); }} /> : null}
        </div>
      </main>
      <footer className={s.bar}>
        <button type="button" className={s.back} onClick={() => { c.setPage('billing'); }}><Icon name="backSmall" className={s.ic} />Back</button>
        {method ? <span className={s.paid}>{d.check.ok && d.check.gap === 0 ? 'Adds up ✓' : ''}</span> : <span className={s.paid} />}
        {method ? <button type="button" className={s.confirm} disabled={!d.check.ok} onClick={confirm}>Confirm payment</button> : null}
      </footer>
      {pad ? <Numpad key={pad} side={pad} rupees={padRupees(pad, d)} onChange={(r) => { d.typed(pad, r); }} onDone={() => { setPad(null); }} /> : null}
      {calc ? <CalcSheet due={dueNow} onClose={() => { setCalc(false); }} onUse={(side, p) => { d.setSplit(pay.putInto(d.cur, side, p, d.toCollect)); setCalc(false); }} /> : null}
      <WaivedSheetHost by={d.waiver.by} note={d.waiver.note} onSave={(by, note) => { d.setWaiver({ by, note }); c.setPayDraft(o.id, { tip: d.tip, waived: d.waived, waivedBy: by, waivedNote: note }); }} />
    </>
  );
}

export function PaymentScreen() {
  const o = useApp((st) => (st.ui.orderId ? st.folded.orders[st.ui.orderId] : undefined));
  const d = useDraft(o);
  if (!o) return null;
  if (d.owed <= 0 && (bill.paid(o) !== 0 || bill.waived(o) > 0)) return <Settled o={o} />;
  if (d.owed === 0 && o.lines.some((l) => l.qty > 0)) return <NothingDue o={o} />;
  return <PayOpen o={o} d={d} />;
}

function WaivedSheetHost({ by, note, onSave }: { by: string; note: string; onSave: (by: string, note: string) => void }) {
  const open = useApp((st) => st.ui.sheet?.kind === 'waived');
  const close = useApp((st) => st.openSheet);
  const [b, setB] = useState(by);
  const [n, setN] = useState(note);
  if (!open) return null;
  return (
    <Sheet title="Waived" onClose={() => { close(null); }}>
      <div className={k.field}><label className={k.fieldLab} htmlFor="wby">Allowed by</label>
        <input id="wby" className={k.input} value={b} maxLength={CONFIG.limits.nameMaxChars} onChange={(e) => { setB(e.target.value); }} /></div>
      <div className={k.field}><label className={k.fieldLab} htmlFor="wnote">Note</label>
        <input id="wnote" className={k.input} value={n} maxLength={CONFIG.limits.noteMaxChars} onChange={(e) => { setN(e.target.value); }} /></div>
      <button type="button" className={[k.cta, s.ctaFull].join(' ')} onClick={() => { onSave(b.trim(), n.trim()); close(null); }}>Done</button>
    </Sheet>
  );
}
