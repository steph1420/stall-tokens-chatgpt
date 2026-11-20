// F-19..F-22 kitchen and station store flow.
import { describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../mock/fixtures';
import { bill, isOpen, kitchen, liveOrders } from '.';
import { makeTestStore, stepClock } from './testkit';

/** Test-only: fail loudly instead of a non-null assertion. */
const must = <T,>(x: T | null | undefined): T => { if (x === null || x === undefined) throw new Error('missing'); return x; };

async function ready(delaySec = 0) {
  const t = makeTestStore({ now: stepClock() });
  await t.store.getState().start();
  const s = () => t.store.getState();
  if (delaySec === 0) s().setPrefs({ nextOrderDelaySec: 0 });
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const idOf = (name: string) => Object.values(s().folded.items).find((i) => i.name === name)?.id ?? '';
  /** One sent order with the named items; returns its id. */
  const send = (...names: string[]) => {
    s().counter.newOrder();
    for (const n of names) s().counter.addItem(idOf(n));
    s().counter.sendToKitchen();
    return s().ui.orderId ?? '';
  };
  const order = (id: string) => { const o = s().folded.orders[id]; if (!o) throw new Error('no order'); return o; };
  const statuses = (id: string) => order(id).lines.map((l) => `${l.name}:${l.status}`);
  return { s, send, order, statuses };
}

describe('kitchen and station (F-19..F-22)', () => {
  it('station taps, auto-prep, Counter confirm and hand over close the order', async () => {
    const { s, send, order, statuses } = await ready();
    const a = send('Tea', 'Samosa');
    const b = send('Coffee');
    const orders = () => liveOrders(s().folded);
    expect(kitchen.toMake(orders(), null)).toBe(3);
    expect(kitchen.toMake(orders(), 'Beverages')).toBe(2);
    const tea = order(a).lines[0]?.lineId ?? '';
    expect(s().kitchen.advance(a, tea)).toBe(true); // Waiting → Preparing
    expect(s().kitchen.advance(a, tea)).toBe(true); // Preparing → Done?, so Beverages starts the next order
    expect(s().kitchen.advance(a, tea)).toBe(false); // Done? waits for the Counter
    expect(statuses(b)).toEqual(['Coffee:preparing']);
    expect(kitchen.counterStep(order(a))).toBe('confirm');
    expect(s().kitchen.sendBack(a)).toBe(true);
    expect(statuses(a)[0]).toBe('Tea:preparing');
    s().kitchen.advance(a, tea);
    expect(s().kitchen.confirmDone(a)).toBe(true);
    expect(kitchen.counterStep(order(a))).toBe('handover');
    expect(s().kitchen.handOver(a)).toBe(true);
    expect(kitchen.handedMeta(order(a))).toBe('1 of 2 handed over'); // Q-KITCHEN-4 A: handed line stays, muted
    expect(kitchen.kitchenOrders(orders()).map((o) => o.id)).toEqual([a, b]);
    const samosa = order(a).lines[1]?.lineId ?? '';
    s().kitchen.advance(a, samosa); s().kitchen.advance(a, samosa); s().kitchen.confirmDone(a); s().kitchen.handOver(a);
    expect(kitchen.kitchenOrders(orders()).map((o) => o.id)).toEqual([b]);
    expect(isOpen(order(a))).toBe(true); // still unpaid: the Counter keeps it open
  });

  it('priority goes first, hold toggles, auto-prep can be switched off, back returns to the opener', async () => {
    const { s, send, order, statuses } = await ready();
    const a = send('Tea');
    const b = send('Coffee');
    s().kitchen.togglePriority(b);
    expect(kitchen.kitchenOrders(liveOrders(s().folded)).map((o) => o.id)).toEqual([b, a]);
    const coffee = order(b).lines[0]?.lineId ?? '';
    expect(s().kitchen.toggleHold(b, coffee)).toBe(true);
    expect(statuses(b)).toEqual(['Coffee:held']);
    expect(s().kitchen.toggleHold(b, coffee)).toBe(true);
    s().setPrefs({ autoPrep: false });
    s().kitchen.advance(b, coffee); s().kitchen.advance(b, coffee);
    expect(statuses(a)).toEqual(['Tea:waiting']);
    s().kitchen.openKitchen();
    s().kitchen.openStation('Beverages', 'kitchen');
    expect(s().ui.station?.orderId).toBe(b);
    s().kitchen.stepStationOrder(1);
    expect(s().ui.station?.orderId).toBe(a);
    s().kitchen.closeStation();
    expect(s().ui.screen).toBe('kitchen');
    expect(kitchen.overview(liveOrders(s().folded), 'Beverages').items).toEqual([{ name: 'Tea', qty: 1 }]);
  });

  it('Priority pauses other Preparing lines at its stations and resumes them when done (Q-PAUSE-1 A)', async () => {
    const { s, send, order, statuses } = await ready();
    const a = send('Tea', 'Samosa'); // Beverages + Cutlets
    const b = send('Coffee'); // Beverages
    const tea = order(a).lines[0]?.lineId ?? '';
    const samosa = order(a).lines[1]?.lineId ?? '';
    s().kitchen.advance(a, tea); s().kitchen.advance(a, samosa); // both Preparing
    s().kitchen.togglePriority(b);
    expect(statuses(a)).toEqual(['Tea:paused', 'Samosa:preparing']); // only the station B needs
    expect(kitchen.pauseMoves(liveOrders(s().folded))).toEqual([]); // settled: nothing more to write
    expect(s().kitchen.advance(a, tea)).toBe(false); // a tap cannot beat the pause
    expect(statuses(a)[0]).toBe('Tea:paused');
    const coffee = order(b).lines[0]?.lineId ?? '';
    s().kitchen.advance(b, coffee); s().kitchen.advance(b, coffee); // Priority order Done? at Beverages
    expect(statuses(a)).toEqual(['Tea:preparing', 'Samosa:preparing']);
  });

  it('a station can hand over a Ready line with one more tap (Q-HANDOVER-1 C); Priority off resumes too', async () => {
    const { s, send, order, statuses } = await ready();
    const a = send('Tea');
    const b = send('Coffee');
    const tea = order(a).lines[0]?.lineId ?? '';
    s().kitchen.advance(a, tea);
    s().kitchen.togglePriority(b);
    expect(statuses(a)).toEqual(['Tea:paused']);
    s().kitchen.togglePriority(b);
    expect(statuses(a)).toEqual(['Tea:preparing']);
    s().kitchen.advance(a, tea); s().kitchen.confirmDone(a);
    expect(s().kitchen.advance(a, tea)).toBe(true);
    expect(statuses(a)).toEqual(['Tea:handed']);
    expect(s().kitchen.advance(a, tea)).toBe(false);
  });
  it('the Counter marks any line finished (Ready, Marked by counter); Ready never completes, only handover does (Q-COUNTER-FINISH, Q-COMPLETE-2 A)', async () => {
    const { s, send, order, statuses } = await ready();
    const a = send('Tea');
    const b = send('Coffee', 'Samosa');
    const tea = order(a).lines[0]?.lineId ?? '';
    const coffee = order(b).lines[0]?.lineId ?? '';
    s().kitchen.advance(a, tea);
    s().kitchen.togglePriority(b);
    expect(statuses(a)).toEqual(['Tea:paused']);
    expect(s().kitchen.finishLine(b, coffee)).toBe(true); // from Waiting, kitchen untouched
    expect(statuses(b)).toEqual(['Coffee:ready', 'Samosa:waiting']);
    expect(order(b).lines[0]?.byCounter).toBe(true);
    expect(statuses(a)).toEqual(['Tea:preparing']); // Priority no longer needs Beverages
    expect(s().kitchen.finishLine(b, coffee)).toBe(false); // already marked
    expect(s().kitchen.finishLine(a, tea)).toBe(true); // from Preparing too
    expect(s().kitchen.advance(a, tea)).toBe(true); // station tap hands it over
    expect(statuses(a)).toEqual(['Tea:handed']);
    expect(order(a).lines[0]?.byCounter).toBe(true);
    expect(s().kitchen.finishLine(a, tea)).toBe(false);
    expect(order(b).lines[1]?.byCounter).toBe(false);
    // Q-COMPLETE-2 A (W-06, W-27): Ready never completes, whoever marked it; only handed-over lines do.
    const orders = () => kitchen.kitchenOrders(liveOrders(s().folded)).map((o) => o.id);
    expect(orders()).toEqual([b]);
    const samosa = order(b).lines[1]?.lineId ?? '';
    s().kitchen.advance(b, samosa); s().kitchen.advance(b, samosa); s().kitchen.confirmDone(b);
    expect(orders()).toEqual([b]); // Samosa Ready, not yet handed over
    s().kitchen.advance(b, samosa);
    expect(kitchen.orderComplete(order(b))).toBe(false); // Coffee is only "Marked by counter", not handed over
    expect(kitchen.lineMuted(must(order(b).lines[0]))).toBe(true);
    expect(orders()).toEqual([b]);
    s().kitchen.advance(b, coffee); // a tap hands the Counter-marked line over
    expect(kitchen.orderComplete(order(b))).toBe(true);
    expect(orders()).toEqual([]);
  });
  it('cancelling a paid Priority order releases the pause and records the refund due (Q-CANCEL-1 A)', async () => {
    const { s, send, order, statuses } = await ready();
    const a = send('Tea');
    const b = send('Coffee');
    const tea = order(a).lines[0]?.lineId ?? '';
    const coffee = order(b).lines[0]?.lineId ?? '';
    s().kitchen.advance(a, tea); s().kitchen.advance(b, coffee);
    s().kitchen.togglePriority(b);
    expect(statuses(a)).toEqual(['Tea:paused']);
    const paid = bill.total(order(b));
    expect(s().counter.pay({ cash: paid, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: paid, notes: {} })).toBeNull();
    expect(s().counter.cancelOrder(b, ' Wrong item ')).toBe(true);
    expect(order(b).cancel).toMatchObject({ reason: 'Wrong item', refundDue: paid });
    expect(statuses(a)).toEqual(['Tea:preparing']); // pause released
    expect(kitchen.kitchenOrders(liveOrders(s().folded)).map((o) => o.id)).toEqual([a]);
    expect(isOpen(order(b))).toBe(false);
    expect(s().counter.cancelOrder(b, '')).toBe(false); // once only
    expect(s().kitchen.finishLine(b, coffee)).toBe(false); // a cancelled order takes no more kitchen ops
    expect(statuses(b)).toEqual(['Coffee:preparing']);
  });
});
