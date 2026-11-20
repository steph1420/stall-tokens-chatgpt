// F-14 F-16 F-17 Payment split, waived gap, change and validation. Pure; paise.
import type { Paise } from '../../contract';

/** pinned = the box last typed or slid (it keeps its value); locked = the side the person locked (pay3: never changes by
 * itself; only one side at a time); waived only from the explicit − Waive control. Cash + UPI + waived = the amount to collect. */
export type Side = 'cash' | 'upi';
export interface Split { cash: Paise; upi: Paise; pinned: Side | null; waived?: Paise; locked?: Side | null }

const whole = (v: Paise): Paise => Math.max(0, Math.trunc(Number.isFinite(v) ? v : 0));
const avail = (split: Split, toCollect: Paise): Paise => Math.max(0, toCollect - whole(split.waived ?? 0));
const other = (s: Side): Side => (s === 'cash' ? 'upi' : 'cash');

/** Typing one box makes the other the difference (UPI = due − cash, cash = due − UPI), clamped to 0..due. While one side is
 * locked the other is not typed (the screen refuses it); typing the locked side keeps it locked. */
export function setBox(split: Split, box: Side, value: Paise, toCollect: Paise): Split {
  const a = avail(split, toCollect);
  const v = Math.min(whole(value), a);
  const base = { pinned: box, waived: whole(split.waived ?? 0), locked: split.locked ?? null };
  return box === 'cash' ? { ...base, cash: v, upi: a - v } : { ...base, cash: a - v, upi: v };
}

/** The amount changed (+ Tip, − Waive, the bill on another phone): the locked side (else the last typed one) keeps its value,
 * clamped to the new amount; the other side takes the difference. */
export function refit(split: Split, toCollect: Paise): Split {
  const waived = Math.min(whole(split.waived ?? 0), Math.max(0, toCollect));
  const s0 = { ...split, waived };
  const keep = split.locked ?? split.pinned;
  if (keep === null) return { cash: avail(s0, toCollect), upi: 0, pinned: null, waived, locked: null };
  return { ...setBox(s0, keep, split[keep], toCollect), pinned: split.pinned };
}

/** True when the locked side had to come down to fit a smaller amount (the screen shows a calm toast). */
export const lockClamped = (before: Split, after: Split): boolean => !!before.locked && after[before.locked] < before[before.locked];

/** pay3 lock: only one side; locking one unlocks the other; tapping the locked one unlocks it. */
export function toggleLock(split: Split, side: Side): Split {
  return { ...split, locked: split.locked === side ? null : side, pinned: split.locked === side ? split.pinned : side };
}

/** A tip change: with a lock, the unlocked side absorbs it; otherwise it goes to cash, or to UPI when the payment is all UPI. */
export function addTip(split: Split, _delta: Paise, toCollect: Paise): Split {
  if (split.locked) return refit(split, toCollect);
  if (split.pinned === null) return refit(split, toCollect);
  const allUpi = split.cash === 0 && split.upi > 0;
  return { ...refit({ ...split, pinned: allUpi ? 'cash' : 'upi' }, toCollect), pinned: split.pinned };
}

/** Slider: cash share of what is being collected, snapped (₹10), clamped to [0, covered]. UPI takes the rest.
 * D-PAY3-2: the screen disables the slider while a side is locked. */
export function slide(fraction: number, covered: Paise, snap: Paise, waived: Paise = 0): Split {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  let cash = Math.round((covered * f) / snap) * snap;
  if (covered - cash <= snap / 2 || f >= 1) cash = covered; // a last odd ₹5 snaps to the end
  cash = Math.min(covered, Math.max(0, cash));
  return { cash, upi: covered - cash, pinned: 'cash', waived: whole(waived), locked: null };
}

/** The explicit − Waive control: never more than the bill (the tip can't be waived); the boxes rebalance. */
export function setWaived(split: Split, value: Paise, toCollect: Paise, tip: Paise): Split {
  const waived = Math.min(whole(value), Math.max(0, toCollect - tip));
  return refit({ ...split, waived }, toCollect);
}

/** Calculator "Use as Cash / UPI": put the amount into that side and lock it. */
export function putInto(split: Split, side: Side, value: Paise, toCollect: Paise): Split {
  return setBox({ ...split, locked: side }, side, value, toCollect);
}

/**
 * When Cash or UPI is locked, the other is freely changeable;
 * difference becomes Tip (if over bill) or Waive (if under bill).
 */
export function changeUnlocked(
  split: Split,
  side: Side,
  value: Paise,
  owed: Paise,
): { split: Split; tip: Paise; waived: Paise } {
  const v = whole(value);
  const baseOwed = whole(owed);
  const lk = split.locked;
  if (!lk || lk === side) {
    const tip = Math.max(0, v - baseOwed);
    const s: Split = {
      cash: side === 'cash' ? v : Math.max(0, baseOwed - v),
      upi: side === 'upi' ? v : Math.max(0, baseOwed - v),
      pinned: side,
      locked: lk ?? null,
      waived: 0,
    };
    return { split: s, tip, waived: 0 };
  }
  const lockedVal = split[lk];
  const total = lockedVal + v;
  const tip = Math.max(0, total - baseOwed);
  const waived = Math.max(0, baseOwed - total);
  const s: Split = {
    cash: side === 'cash' ? v : lockedVal,
    upi: side === 'upi' ? v : lockedVal,
    pinned: side,
    locked: lk,
    waived,
  };
  return { split: s, tip, waived };
}

export const otherSide = other;

export interface PayCheck { ok: boolean; gap: Paise; over: Paise; reason: string }

/** Cash + UPI + waived must equal the amount to collect. Short = waived row; over = blocked. */
export function checkPayment(cash: Paise, upi: Paise, toCollect: Paise, tip: Paise, waived: Paise = 0): PayCheck {
  const gap = toCollect - cash - upi;
  if (toCollect <= 0) return { ok: false, gap: 0, over: 0, reason: 'Nothing to collect' };
  if (cash < 0 || upi < 0) return { ok: false, gap, over: 0, reason: 'Amounts cannot be negative' };
  if (gap < 0) return { ok: false, gap: 0, over: -gap, reason: 'More than the amount to collect' };
  if (gap > toCollect - tip) return { ok: false, gap, over: 0, reason: 'Waived cannot include the tip' };
  if (gap !== whole(waived)) return { ok: false, gap, over: 0, reason: 'Cash and UPI must add up to the amount' }; // no implicit waive
  return { ok: true, gap, over: 0, reason: '' };
}

/** Count notes: total of counted notes (rupee note -> count). */
export const notesTotal = (notes: Readonly<Record<string, number>>): Paise =>
  Object.entries(notes).reduce((t, [note, n]) => t + Number(note) * 100 * Math.max(0, Math.trunc(n)), 0);

export const change = (cashGiven: Paise, cash: Paise): Paise => Math.max(0, cashGiven - cash);
