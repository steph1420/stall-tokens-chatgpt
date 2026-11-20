// F-43 UI (Q-ORDERS-1): Lines look gives Mark ready per line and Ready + Confirm for a station's proposed-done line;
// the header opens the order sheet; Handover delivers the whole order (Q-COMPLETE-1 A).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../../mock/fixtures';
import { bill, isOpen, kitchen, orderStatus, StoreProvider } from '../../../store';
import { makeTestStore, stepClock } from '../../../store/testkit';
import { CancelSheet } from '../CancelSheet';
import { OpenOrdersScreen } from './OpenOrdersScreen';

/** Test-only: fail loudly instead of a non-null assertion. */
const must = <T,>(x: T | null | undefined): T => { if (x === null || x === undefined) throw new Error('missing'); return x; };

afterEach(cleanup);

async function setup() {
  const { store } = makeTestStore({ now: stepClock() });
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  s().counter.newOrder(); s().counter.addItem(id('Tea')); s().counter.addItem(id('Samosa')); s().counter.sendToKitchen();
  const oid = s().ui.orderId ?? '';
  render(<StoreProvider store={store}><OpenOrdersScreen /><CancelSheet /></StoreProvider>);
  return { s, oid };
}

describe('Open Orders', () => {
  it('marks a line ready, confirms a station Ready, and the header opens the order sheet', async () => {
    const { s, oid } = await setup();
    expect(screen.queryByText('Counter · All open orders')).toBeNull(); // W-01: band removed
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Mark ready/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready: Tea' }));
    expect(screen.getByText('Marked by counter')).toBeTruthy();
    const samosa = s().folded.orders[oid]?.lines.find((l) => l.name === 'Samosa')?.lineId ?? '';
    act(() => { s().kitchen.advance(oid, samosa); s().kitchen.advance(oid, samosa); });
    expect(screen.queryByText('Done?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Samosa' }));
    expect(s().folded.orders[oid]?.lines.find((l) => l.lineId === samosa)?.status).toBe('ready');
    fireEvent.click(screen.getByRole('button', { name: /open order sheet/ }));
    expect(screen.getByRole('button', { name: 'Edit in Billing' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Asha' } });
    fireEvent.blur(screen.getByLabelText('Client name'));
    expect(s().folded.orders[oid]?.client).toBe('Asha');
  });

  it('Handover while unpaid delivers every line but keeps the order open as Unpaid (W-05, Q-HANDOVER-PAY)', async () => {
    const { s, oid } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Handover' }));
    const o = s().folded.orders[oid];
    expect(o && kitchen.orderComplete(o)).toBe(true); // every line handed over (kitchen views drop it)
    expect(o && orderStatus(o, undefined)).toBe('Unpaid');
    expect(o && isOpen(o)).toBe(true);
    expect(screen.queryByText('Completed')).toBeNull();
    expect(s().open.complete(oid)).toBe('unpaid'); // one tap is refused while money is due
    const due = o ? bill.due(o) : 0;
    act(() => { expect(s().counter.pay({ cash: due, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: due, notes: {} })).toBeNull(); });
    expect(isOpen(must(s().folded.orders[oid]))).toBe(false); // handed over + paid = completed
    expect(screen.getByText('Completed')).toBeTruthy();
  });
});
