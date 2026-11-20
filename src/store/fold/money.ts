// F-23..F-29 Money ops in the fold. Entries only add (they never clash, plan §2); a void keeps the record.
// Parts are checked here because ops come from other devices too: a part with a bad amount or source is dropped,
// and an entry whose parts do not add up to its amount is kept with one Register part (never half-applied).
import type { Entry, MoneyPart, Op } from '../../contract';
import { lww } from './lww';
import type { Folded } from './state';

const SOURCES: ReadonlySet<string> = new Set(['register', 'upi', 'person']);
function cleanParts(raw: readonly unknown[], amount: number): MoneyPart[] {
  const parts = raw.flatMap((p): MoneyPart[] => {
    if (typeof p !== 'object' || p === null) return [];
    const r = p as Record<string, unknown>;
    if (typeof r.source !== 'string' || !SOURCES.has(r.source) || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0) return [];
    const personId = typeof r.personId === 'string' && r.personId ? r.personId : null;
    if (r.source === 'person' && !personId) return [];
    return [{ source: r.source as MoneyPart['source'], personId: r.source === 'person' ? personId : null, amount: Math.trunc(r.amount) }];
  });
  const sum = parts.reduce((t, p) => t + p.amount, 0);
  return sum === amount ? parts : [{ source: 'register', personId: null, amount }];
}

const REASONS: ReadonlySet<string> = new Set(['gifted', 'paid-directly', 'written-off', 'shared-cost']);
export type MoneyKind = 'person.set' | 'entry.add' | 'entry.void' | 'settle.pay' | 'settle.clear' | 'settle.undo' | 'day.lock';
export const MONEY_KINDS: ReadonlySet<string> = new Set<MoneyKind>(['person.set', 'entry.add', 'entry.void', 'settle.pay', 'settle.clear', 'settle.undo', 'day.lock']);

function applySettle(s: Folded, op: Op<'settle.pay' | 'settle.clear' | 'settle.undo' | 'day.lock'>): Folded {
  switch (op.kind) {
    case 'settle.pay': case 'settle.clear': {
      const b = op.body;
      const id = op.kind === 'settle.pay' ? op.body.payId : op.body.clearId;
      if (s.settlements.some((x) => x.id === id) || !Number.isFinite(b.amount) || b.amount === 0) return s;
      const pay = op.kind === 'settle.pay' ? op.body : null;
      const clr = op.kind === 'settle.clear' ? op.body : null;
      const via = pay && SOURCES.has(pay.via) ? pay.via : pay ? 'register' : null;
      return { ...s, settlements: [...s.settlements, {
        id, kind: pay ? 'pay' : 'clear', dayId: b.dayId, personId: b.personId, amount: Math.trunc(b.amount), via,
        byPersonId: via === 'person' ? pay?.byPersonId ?? null : null, reason: clr && REASONS.has(clr.reason) ? clr.reason : clr ? 'written-off' : null,
        note: clr?.note ?? '', at: op.wallAt, undone: false,
      }] };
    }
    case 'settle.undo': return { ...s, settlements: s.settlements.map((x) => (x.id === op.body.targetId ? { ...x, undone: true } : x)) };
    case 'day.lock': {
      const st = lww(s, `day:${op.body.dayId}`, 'lock', op).state;
      const split = Object.fromEntries(Object.entries(op.body.split).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Math.trunc(v)]));
      return { ...st, locks: { ...st.locks, [op.body.dayId]: { locked: op.body.locked, split, at: op.wallAt } } };
    }
  }
}

export function applyMoneyOp(s: Folded, op: Op<MoneyKind>): Folded {
  switch (op.kind) {
    case 'person.set': {
      const w = lww(s, `person:${op.body.personId}`, 'all', op);
      if (!w.apply) return w.state;
      const st = w.state;
      const { personId: id, name, isPartner, sharePct, removed } = op.body;
      const people = removed
        ? Object.fromEntries(Object.entries(st.people).filter(([k]) => k !== id))
        : { ...st.people, [id]: { id, name, isPartner, sharePct: Math.max(0, Math.min(100, sharePct)) } };
      return { ...st, people };
    }
    case 'entry.add': {
      const b = op.body;
      const amount = Math.trunc(b.amount);
      if (amount <= 0 || s.entries.some((e) => e.id === b.entryId)) return s;
      const e: Entry = {
        id: b.entryId, dayId: b.dayId, dir: b.dir === 'received' ? 'received' : 'spent', amount, label: b.label, kind: b.kind === 'donation' ? 'donation' : 'normal',
        parts: cleanParts(b.parts, amount), note: b.note, personId: typeof b.personId === 'string' && b.personId ? b.personId : null, at: op.wallAt, by: op.writer, voided: null,
      };
      return { ...s, entries: [...s.entries, e] };
    }
    case 'entry.void':
      return { ...s, entries: s.entries.map((e) => (e.id === op.body.entryId && e.voided === null ? { ...e, voided: op.body.reason || 'voided' } : e)) };
    default: return applySettle(s, op);
  }
}
