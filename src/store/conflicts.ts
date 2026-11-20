// Q-HARM-10 Sync > Review: every recorded clash, and "Use this instead" which flips it by writing a NEW op with the
// losing value (the log is never rewritten). Nothing here blocks sync.
import type { Conflict, Op } from '../contract';
import { formatInr } from '../contract';
import type { Log } from './core';

/** The value a conflict's op carried for its field, as a short label for the Review list. */
/** Fields stored in paise, shown as ₹ in Review. */
const PAISE_FIELDS = new Set(['price', 'amount', 'discount']);

export function conflictValue(op: Op | undefined, field: string): string {
  if (!op) return '—';
  const b = op.body as unknown as Record<string, unknown>;
  const f = (b.fields ?? null) as Record<string, unknown> | null;
  const v = f && field in f ? f[field] : field === 'all' ? b.name ?? b.value : b[field] ?? b.value ?? b.note;
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number' && PAISE_FIELDS.has(field)) return formatInr(v);
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
}

export function conflictActions(log: Log) {
  const find = (id: string) => log.all().find((o) => o.opId === id);
  return {
    /** Both sides of a clash, for display. */
    sides(c: Conflict) { const w = find(c.winner); const l = find(c.loser); return { kept: conflictValue(w, c.field), other: conflictValue(l, c.field), keptBy: w?.writer ?? '', otherBy: l?.writer ?? '' }; },
    /** Re-applies the losing side as a new op (only its field for patch kinds). */
    flip(c: Conflict): boolean {
      const l = find(c.loser);
      if (!l) return false;
      if (l.kind === 'item.set' || l.kind === 'record.set') {
        const fields = l.body.fields as Record<string, unknown>;
        if (!(c.field in fields)) { log.dispatch(l.kind, l.body); return true; }
        log.dispatch(l.kind, { ...l.body, fields: { [c.field]: fields[c.field] } } as never);
        return true;
      }
      log.dispatch(l.kind, l.body);
      return true;
    },
  };
}
