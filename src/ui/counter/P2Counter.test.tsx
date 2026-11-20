// P2 Counter UI: Unpaid tab (s120) → order view (s121) → Take payment; one-tap Refund with an Undo toast (s122);
// Drafts discard needs a second tap (s123); the take-over card (s127a) has Take over / New order / Back + Check now;
// the paid screen shows one New order (the header + hides).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../mock/fixtures';
import { bill, StoreProvider } from '../../store';
import { makeTestStore } from '../../store/testkit';
import { Toast } from '../kit/Toast';
import { CounterShell } from './CounterShell';
import { TakeOverCard } from './TakeOver';

afterEach(cleanup);

async function setup() {
  const { store } = makeTestStore();
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } }));
  return { store, s, id };
}
const payAll = (s: Awaited<ReturnType<typeof setup>>['s']) => {
  const o = s().folded.orders[s().ui.orderId ?? ''];
  const d = o ? bill.due(o) : 0;
  return s().counter.pay({ cash: d, upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: d, notes: {} });
};

describe('P2 Counter', () => {
  it('Unpaid tab lists the order with what is owed; tapping opens it; Take payment goes to Payment', async () => {
    const { store, s, id } = await setup();
    s().counter.addItem(id('Tea')); s().counter.sendToKitchen();
    const oid = s().ui.orderId ?? '';
    render(<StoreProvider store={store}><CounterShell /></StoreProvider>);
    fireEvent.click(screen.getByRole('tab', { name: /Unpaid/ }));
    expect(screen.getByText(/to collect/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /#001/ }));
    expect(s().ui.orderView).toBe(oid);
    expect(screen.getByRole('button', { name: 'Complete (hold)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Take payment/ }));
    expect(s().ui.orderView).toBeNull();
    expect(s().ui.pages[oid]).toBe('payment');
    expect(screen.getByRole('group', { name: 'How to pay' })).toBeTruthy();
  });
  it('paid screen: one New order button (the header + hides)', async () => {
    const { store, s, id } = await setup();
    s().counter.addItem(id('Tea')); s().counter.setPage('payment');
    expect(payAll(s)).toBeNull();
    render(<StoreProvider store={store}><CounterShell /></StoreProvider>);
    expect(screen.getAllByRole('button', { name: 'New order' })).toHaveLength(1);
  });
  it('one-tap Refund from the order view, with Undo in the toast', async () => {
    const { store, s, id } = await setup();
    s().counter.addItem(id('Tea')); s().counter.sendToKitchen(); payAll(s);
    const oid = s().ui.orderId ?? '';
    s().open.viewOrder(oid);
    render(<StoreProvider store={store}><CounterShell /><Toast /></StoreProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(bill.held(s().folded.orders[oid] ?? ({} as never))).toBe(0);
    const toast = screen.getByRole('status');
    expect(toast.textContent).toMatch(/Refunded ₹.* · Cash/);
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(bill.held(s().folded.orders[oid] ?? ({} as never))).toBeGreaterThan(0);
  });
  it('Drafts: Discard needs a second tap', async () => {
    const { store, s, id } = await setup();
    s().counter.addItem(id('Tea'));
    const draft = s().ui.orderId ?? '';
    s().counter.newOrder(); s().counter.addItem(id('Samosa'));
    render(<StoreProvider store={store}><CounterShell /></StoreProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Drafts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard #001' }));
    expect(s().folded.orders[draft]?.deleted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to discard #001' }));
    expect(s().folded.orders[draft]?.deleted).toBe(true);
  });
  it('take-over card: Take over, New order, Back in that order, plus Check now', async () => {
    const { store, s, id } = await setup();
    s().counter.addItem(id('Tea'));
    const oid = s().ui.orderId ?? '';
    render(<StoreProvider store={store}><TakeOverCard orderId={oid} label="Counter 2" /></StoreProvider>);
    expect(screen.getByRole('heading').textContent).toBe('#001 is open on Counter 2');
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names.slice(-3)).toEqual(['Take over', 'New order', 'Back']);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'New order' })); });
    expect(s().ui.orderId).not.toBe(oid);
  });
});
