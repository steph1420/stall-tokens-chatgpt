// P4 screens (F-64..F-68): History Orders · Money with tags and search, day notes from the day header, Close the day
// (skip, cash count with "₹20 short", lock, summary), the Extras switches, Money's Unpaid tile, Stock's All rail and chips.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { DEMO_MENU } from '../../mock/fixtures';
import { bill, StoreProvider } from '../../store';
import { makeTestStore } from '../../store/testkit';
import { StallScreens } from './StallScreens';
import type { StallScreen } from '../../store';

afterEach(cleanup);
async function setup(screenId: StallScreen) {
  const { store } = makeTestStore();
  await store.getState().start();
  const s = () => store.getState();
  const id: Record<string, string> = {};
  for (const m of DEMO_MENU) {
    s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: m.count });
    id[m.itemId] = Object.values(s().folded.items).find((i) => i.name === m.name)?.id ?? '';
  }
  s().money.openStall(50000);
  const order = (items: readonly string[], paid: boolean) => {
    s().counter.newOrder();
    for (const i of items) s().counter.addItem(id[i] ?? '');
    s().counter.sendToKitchen();
    const o = s().folded.orders[s().ui.orderId ?? ''];
    if (o && paid) s().counter.pay({ cash: bill.due(o), upi: 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 0, notes: {} });
    return o?.id ?? '';
  };
  order(['tea', 'tea'], true);
  order(['vadapav'], false);
  s().openStall(screenId);
  const view = render(<StoreProvider store={store}><StallScreens screen={screenId} /></StoreProvider>);
  const again = () => { view.rerender(<StoreProvider store={store}><StallScreens screen={screenId} /></StoreProvider>); };
  return { s, again, order };
}

describe('History (F-64, F-67)', () => {
  it('shows every sent order with its tag; search is on by default and hides when switched off', async () => {
    const { s, again } = await setup('history');
    expect(screen.getByText('#001')).toBeTruthy();
    expect(screen.getByText('Paid cash')).toBeTruthy();
    expect(screen.getByText('Unpaid ₹25')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search orders' }), { target: { value: 'vada' } });
    expect(screen.queryByText('#001')).toBeNull();
    expect(screen.getByText('#002')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search orders' }), { target: { value: '#9' } });
    expect(screen.getByText('No order matches that.')).toBeTruthy();
    act(() => { s().close.setExtra('historySearch', false); }); again();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByText('#001')).toBeTruthy();
  });
  it('the unpaid row offers Take payment; Money tab lists entries; Notes › saves a day note', async () => {
    const { s } = await setup('history');
    fireEvent.click(screen.getByText('#002'));
    const sheet = screen.getByRole('dialog', { name: 'Order #002' });
    expect(within(sheet).getByRole('button', { name: 'Take payment · ₹25' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Refund' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Take payment · ₹25' }));
    expect([s().ui.screen, s().ui.pages[s().ui.orderId ?? '']]).toEqual(['counter', 'payment']);
    cleanup();
    await setup('history');
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.getByText('Nothing spent or received yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Orders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notes for Today' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crowd' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Rush at 7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(screen.getByRole('button', { name: 'Notes for Today' }).textContent).toBe('Notes ✓ ›');
  });
});

describe('Close the day (F-66)', () => {
  it('walks skip, the cash count (₹20 short) and the summary', async () => {
    const { s, again } = await setup('close');
    expect(s().folded.settings[CONFIG.extras.closeDay]).toBeUndefined();
    expect(screen.getByText('1 unpaid · ₹25 to collect')).toBeTruthy();
    const step1 = screen.getByRole('region', { name: 'Step 1: Unpaid orders' });
    fireEvent.click(within(step1).getByRole('button', { name: 'Leave for later' }));
    again();
    expect(within(screen.getByRole('region', { name: 'Step 1: Unpaid orders' })).getByText('Left for later')).toBeTruthy();
    // Book: ₹500 float + ₹40 cash sales = ₹540. Count ₹500 + 2 × ₹10 = ₹520 → ₹20 short.
    fireEvent.click(screen.getByRole('button', { name: 'Add a ₹500 note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a ₹10 note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a ₹10 note' }));
    expect(screen.getByRole('status').textContent).toBe('₹20 short');
    fireEvent.click(screen.getByRole('button', { name: 'Save count · ₹520' }));
    again();
    expect(screen.getByText('Cash in the box: ₹520 · ₹20 short')).toBeTruthy();
    expect(screen.getByText('Left for later: unpaid orders')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Top sellers' }).textContent).toContain('Tea');
  });
});

describe('Settings Extras, Money tile, Stock rail (F-65, F-68)', () => {
  it('Extras switches start on and write an explicit off', async () => {
    const { s } = await setup('settings');
    const sw = screen.getByRole('switch', { name: /Close the day/ });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(s().folded.settings[CONFIG.extras.closeDay]).toBeUndefined();
    fireEvent.click(sw);
    expect(s().folded.settings[CONFIG.extras.closeDay]).toBe('0');
    expect(screen.getByRole('switch', { name: /Close the day/ }).getAttribute('aria-checked')).toBe('false');
  });
  it('Money Unpaid tile opens the Unpaid tab', async () => {
    const { s } = await setup('money');
    fireEvent.click(screen.getByRole('button', { name: /Unpaid · 1/ }));
    expect([s().ui.screen, s().ui.counterTab]).toEqual(['counter', 'unpaid']);
  });
  it('Stock starts on All; Low and Sold out are chips', async () => {
    await setup('stock');
    expect(screen.getByRole('tab', { name: /All/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Coffee')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sold out · 1/ }));
    expect(screen.getByText('Sandwich')).toBeTruthy();
    expect(screen.queryByText('Coffee')).toBeNull();
  });
});
