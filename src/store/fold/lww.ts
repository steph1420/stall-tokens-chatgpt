// F-02 Last-writer-wins by causal fold order, with conflict recording (Q-HARM-10, LOCKED). The fold runs in Lamport
// order (compareOps), so a later op normally wins. When two writers set the same field without having seen each
// other's op (true concurrency, read from the version vector) a Conflict row is added; never silent.
// Sheet wins (Q-HARM-10 / D-SHEET-WINS): a hand edit on a Sheet info tab (writer `sheet`) beats a concurrent device op
// even when that op sorts later, so an offline phone can't undo Steve's edit without having seen it.
import type { Op } from '../../contract';
import type { Folded } from './state';

export const SHEET_WRITER = 'sheet';
const device = (w: string) => w.split('.')[0];

export function lww(s: Folded, target: string, field: string, op: Op): { state: Folded; conflict: boolean; apply: boolean } {
  const key = `${target}|${field}`;
  const prev = s.lastWrite[key];
  const concurrent = prev !== undefined && device(prev.writer) !== device(op.writer) && (op.vv[prev.writer] ?? 0) < prev.seq;
  const sheetKeeps = concurrent && prev.writer === SHEET_WRITER && op.writer !== SHEET_WRITER;
  const lastWrite = sheetKeeps ? s.lastWrite : { ...s.lastWrite, [key]: { writer: op.writer, seq: op.seq, opId: op.opId } };
  if (!concurrent) return { state: { ...s, lastWrite }, conflict: false, apply: true };
  const conflict = sheetKeeps
    ? { target, field, winner: prev.opId, loser: op.opId, at: op.wallAt, rule: 'sheet-wins' as const }
    : { target, field, winner: op.opId, loser: prev.opId, at: op.wallAt, rule: 'causal' as const };
  return { state: { ...s, lastWrite, conflicts: [...s.conflicts, conflict] }, conflict: true, apply: !sheetKeeps };
}
