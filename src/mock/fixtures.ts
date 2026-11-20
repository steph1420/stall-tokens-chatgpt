// Demo data for tests and e2e only (06 rule 11). Names here are codenames, not real people.
import { CONTRACT_VERSION, rupees, type Bodies, type Op, type OpKind } from '../contract';

export const DEMO_MENU = [
  { itemId: 'tea', name: 'Tea', price: rupees(20), swatch: 0, category: 'Tea', stationId: 'Beverages', count: 24 },
  { itemId: 'coffee', name: 'Coffee', price: rupees(30), swatch: 1, category: 'Tea', stationId: 'Beverages', count: null },
  { itemId: 'samosa', name: 'Samosa', price: rupees(15), swatch: 2, category: 'Snacks', stationId: 'Cutlets', count: null },
  { itemId: 'vadapav', name: 'Vada Pav', price: rupees(25), swatch: 3, category: 'Snacks', stationId: 'Sandwiches', count: null },
  { itemId: 'colddrink', name: 'Cold Drink', price: rupees(40), swatch: 4, category: 'Drinks', stationId: 'Beverages', count: 3 },
  { itemId: 'sandwich', name: 'Sandwich', price: rupees(50), swatch: 5, category: 'Snacks', stationId: 'Sandwiches', count: 0 },
] as const;

/** Builds ops for one fake writer with increasing seq and lamport. */
export function opMaker(writer: string, startLamport = 0) {
  let seq = 0;
  let lamport = startLamport;
  return <K extends OpKind>(kind: K, body: Bodies[K], extra: { lamport?: number; vv?: Record<string, number>; wallAt?: number } = {}): Op => {
    seq += 1;
    lamport = extra.lamport ?? lamport + 1;
    return { v: CONTRACT_VERSION, opId: `${writer}:${String(seq)}`, writer, seq, lamport, vv: extra.vv ?? {}, wallAt: extra.wallAt ?? 1_700_000_000_000 + seq, kind, body } as Op;
  };
}

export function demoMenuOps(writer = 'demo0000.m'): Op[] {
  const mk = opMaker(writer);
  return DEMO_MENU.map((m, i) => mk('item.set', { itemId: m.itemId, fields: { name: m.name, price: m.price, swatch: m.swatch, category: m.category,
    stationId: m.stationId, count: m.count, order: i + 1, lowAt: 5, soldOut: false, removed: false } }));
}
