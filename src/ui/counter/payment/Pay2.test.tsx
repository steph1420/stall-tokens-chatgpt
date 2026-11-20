// pay2 (locked 17 Nov): Cash + UPI always equal the amount due; + Tip / − Waive are the only way to change it (Undo toast);
// (pay3 removed the one-tap cash given row); tip and waive reach the payment record, the slip and the day summary.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../../mock/fixtures';
import { bill, money, StoreProvider } from '../../../store';
import { makeTestStore } from '../../../store/testkit';
import { Toast } from '../../kit/Toast';
import { CounterShell } from '../CounterShell';

afterEach(cleanup);

async function payScreen() {
  const { store } = makeTestStore();
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } }));
  act(() => { for (let i = 0; i < 4; i++) s().counter.addItem(id('Tea')); s().counter.sendToKitchen(); s().counter.setPage('payment'); });
  render(<StoreProvider store={store}><CounterShell /><Toast /></StoreProvider>);
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Split' })); });
  return { s };
}
const due = () => screen.getByText('To collect').nextElementSibling?.textContent ?? '';
const box = (n: string) => screen.getByRole('button', { name: new RegExp(`^${n} ₹`) }).textContent;
const tap = (name: string | RegExp) => { act(() => { fireEvent.click(screen.getByRole('button', { name })); }); };

describe('pay2', () => {
  it('+ Tip ₹10 raises the amount due, Cash follows, and Undo puts it back', async () => {
    const { s } = await payScreen();
    const before = due();
    tap(/^\+ Tip/);
    act(() => { fireEvent.click(within(screen.getByRole('group', { name: 'Tip' })).getAllByRole('button')[0] as HTMLElement); });
    expect(due()).not.toBe(before);
    expect(box('Cash').replace(/\D/g, '')).toBe(due().replace(/\D/g, ''));
    expect(screen.getByRole('status').textContent).toMatch(/Tip ₹10 added/);
    tap('Undo');
    expect(due()).toBe(before);
    expect(s().ui.payUndo?.tip).toBe(0);
  });
  it('− Waive ₹20 lowers the amount due; Cash + UPI still equal it; it is recorded on Confirm', async () => {
    const { s } = await payScreen();
    tap(/^− Waive/);
    act(() => { fireEvent.click(within(screen.getByRole('group', { name: 'Waive' })).getAllByRole('button')[1] as HTMLElement); });
    const d = Number(due().replace(/\D/g, ''));
    expect(Number(box('Cash').replace(/\D/g, '')) + Number(box('UPI').replace(/\D/g, ''))).toBe(d);
    tap('Confirm payment');
    const o = Object.values(s().folded.orders)[0];
    expect(o && bill.waived(o)).toBe(2000);
    expect(o && bill.due(o)).toBe(0);
    expect(money.dayMoney(Object.values(s().folded.orders), [], o?.dayId ?? '').waived).toBe(2000);
  });
  it('waive can never go above the bill', async () => {
    const { s } = await payScreen();
    const bill0 = bill.due(Object.values(s().folded.orders)[0] as never);
    tap(/^− Waive/); tap('Other');
    for (const k of ['9', '9', '9']) tap(k);
    tap('Done');
    expect(due().replace(/\D/g, '')).toBe('0');
    expect(screen.getByRole('button', { name: /^− Waive/ }).textContent.replace(/\D/g, '')).toBe(String(bill0 / 100));
  });
});
