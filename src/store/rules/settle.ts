// F-26..F-29 Settlement rules (pure; Q-PART-1 C, Q-NEXT-2 A, Q-SETTLE-GAPS). Balances run across days, so what is
// not settled carries over to the next fair by itself. + = the stall owes the person; − = the person holds stall money.
import type { Entry, Order, Paise, Person, Settlement } from '../../contract';
import type { Folded } from '../fold/state';
import { dayMoney } from './money';

const live = (xs: readonly Settlement[]) => xs.filter((x) => !x.undone);
const personParts = (e: Entry, id: string) => e.parts.filter((p) => p.source === 'person' && p.personId === id).reduce((t, p) => t + p.amount, 0);

/** Balance per person from Spent (paid personally), Received (paid in by them / landed in their pocket) and settlements. */
export function balances(f: Pick<Folded, 'entries' | 'settlements' | 'people'>): Record<string, Paise> {
  const out: Record<string, Paise> = Object.fromEntries(Object.keys(f.people).map((id) => [id, 0]));
  const add = (id: string, v: Paise) => { out[id] = (out[id] ?? 0) + v; };
  for (const e of f.entries.filter((x) => x.voided === null)) {
    for (const id of new Set(e.parts.flatMap((p) => (p.personId ? [p.personId] : [])))) add(id, e.dir === 'spent' ? personParts(e, id) : -personParts(e, id));
    if (e.dir === 'received' && e.personId) add(e.personId, e.amount);
  }
  for (const x of live(f.settlements)) {
    add(x.personId, -x.amount);
    if (x.kind === 'pay' && x.via === 'person' && x.byPersonId) add(x.byPersonId, x.amount); // a partner covering someone gets it added back
  }
  return out;
}

/** What the person's balance is made of, for the sheet subtitle ("Bought ice · 2 entries"). */
export function balanceWhy(f: Pick<Folded, 'entries'>, id: string): { labels: string[]; count: number } {
  const es = f.entries.filter((e) => e.voided === null && (e.personId === id || e.parts.some((p) => p.personId === id)));
  return { labels: [...new Set(es.map((e) => e.label))].slice(0, 2), count: es.length };
}

export interface Split {
  readonly inHand: Paise; readonly toSplit: Paise; readonly others: readonly { person: Person; owed: Paise }[];
  readonly partners: readonly { person: Person; share: Paise; owed: Paise; covering: readonly { personId: string; amount: Paise }[] }[];
  readonly sharesOk: boolean;
  /** F-47 split type (shared setting `splitMode`): by share % or exact rupee amounts (`splitExact:<personId>`, paise). */
  readonly mode: SplitMode; readonly base: Paise; readonly exactLeft: Paise;
}
export type SplitMode = 'share' | 'exact';
export const splitMode = (s: Readonly<Record<string, string>>): SplitMode => (s.splitMode === 'exact' ? 'exact' : 'share');
export const exactOf = (s: Readonly<Record<string, string>>, id: string): Paise => Math.trunc(Number(s[`splitExact:${id}`] ?? 0)) || 0;
/** Settle up for one day: step 1 repay others; step 2 split what is left between partners by share, each partner's own
 * balance added back (Q-NEXT-2 A). Tips stay out (D-MONEY). A loss day gives negative shares: partners pay in. */
export function split(f: Folded, orders: readonly Order[], dayId: string): Split {
  const d = dayMoney(orders, f.entries, dayId);
  const pays = live(f.settlements).filter((x) => x.kind === 'pay' && x.dayId === dayId && x.via !== 'person').reduce((t, x) => t + x.amount, 0);
  const inHand = d.registerFlow + d.upiFlow - d.tips - pays;
  const bal = balances(f);
  const people = Object.values(f.people);
  const others = people.filter((p) => !p.isPartner && (bal[p.id] ?? 0) !== 0).map((p) => ({ person: p, owed: bal[p.id] ?? 0 }));
  const owedOthers = others.reduce((t, o) => t + o.owed, 0);
  const ps = people.filter((p) => p.isPartner);
  const owedPartners = ps.reduce((t, p) => t + (bal[p.id] ?? 0), 0);
  const base = inHand - owedOthers - owedPartners;
  const covering = (id: string) => live(f.settlements).filter((x) => x.kind === 'pay' && x.byPersonId === id).map((x) => ({ personId: x.personId, amount: x.amount }));
  const mode = splitMode(f.settings);
  const part = (p: Person) => (mode === 'exact' ? exactOf(f.settings, p.id) : Math.round((base * p.sharePct) / 100));
  const partners = ps.map((p) => ({ person: p, owed: bal[p.id] ?? 0, covering: covering(p.id), share: part(p) + (bal[p.id] ?? 0) }));
  const exactLeft = base - ps.reduce((t, p) => t + exactOf(f.settings, p.id), 0);
  const sharesOk = mode === 'exact' ? exactLeft === 0 : ps.reduce((t, p) => t + p.sharePct, 0) === 100;
  return { inHand, toSplit: inHand - owedOthers, others, partners, sharesOk, mode, base, exactLeft };
}

/** F-47 Simplify debts: who pays whom so everyone ends square in the fewest transfers (greedy largest-first, which is
 * at most n − 1 transfers). `nets`: + = should get money, − = should give. The stall's cash counts as one more party. */
export function fewestTransfers(nets: Readonly<Record<string, Paise>>): { from: string; to: string; amount: Paise }[] {
  const give = Object.entries(nets).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const get = Object.entries(nets).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: { from: string; to: string; amount: Paise }[] = [];
  const byV = (a: { v: number }, b: { v: number }) => b.v - a.v;
  for (;;) {
    give.sort(byV); get.sort(byV);
    const g = give[0]; const r = get[0];
    if (!g || !r || g.v === 0 || r.v === 0) return out;
    const amt = Math.min(g.v, r.v);
    out.push({ from: g.id, to: r.id, amount: amt });
    g.v -= amt; r.v -= amt;
  }
}

/** Nets for Settle up: each person's amount from the split, the stall cash in hand as the party "stall". */
export function settleNets(sp: Split): Record<string, Paise> {
  const nets: Record<string, Paise> = {};
  for (const o of sp.others) nets[o.person.id] = o.owed;
  for (const x of sp.partners) nets[x.person.id] = (nets[x.person.id] ?? 0) + x.share;
  nets.stall = -Object.values(nets).reduce((t, v) => t + v, 0);
  return nets;
}
