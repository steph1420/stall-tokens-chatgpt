// pay5 (D-PAY5-1, Q-PAY5-1 = s129b): Cash | UPI | Split first layer; Count notes drawer remembers open/closed on this phone.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../../mock/fixtures';
import { StoreProvider } from '../../../store';
import { makeTestStore, memoryStorage } from '../../../store/testkit';
import { Toast } from '../../kit/Toast';
import { CounterShell } from '../CounterShell';

afterEach(cleanup);

async function payScreen(opts: { storage?: Storage } = {}) {
  const { store } = makeTestStore(opts.storage ? { storage: opts.storage } : {});
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  s().catalog.savePayee(null, 'Stall One', 'stallone@okbank');
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } }));
  act(() => { for (let i = 0; i < 4; i++) s().counter.addItem(id('Tea')); s().counter.sendToKitchen(); s().counter.setPage('payment'); });
  render(<StoreProvider store={store}><CounterShell /><Toast /></StoreProvider>);
  return { s };
}
const tap = (name: string | RegExp) => { act(() => { fireEvent.click(screen.getByRole('button', { name })); }); };
const how = () => screen.getByRole('group', { name: 'How to pay' });

describe('pay5 Cash | UPI | Split (s129b)', () => {
  it('opens with no method selected: both sides show the due, no Confirm, no split tools', async () => {
    await payScreen();
    const g = how();
    expect(within(g).getByRole('button', { name: /^Cash ₹/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(g).getByRole('button', { name: /^UPI ₹/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(g).getByRole('button', { name: 'Split' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Cash and UPI split' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^\+ Tip/ })).toBeNull();
  });
  it('Cash puts the whole amount on Cash and offers Confirm; UPI shows the QR straight away', async () => {
    await payScreen();
    tap(/^Cash ₹/);
    expect(within(how()).getByRole('button', { name: /^Cash ₹/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Confirm payment' })).toBeTruthy();
    expect(document.querySelector('[data-qr]')).toBeNull();
    act(() => { fireEvent.click(within(how()).getByRole('button', { name: 'UPI' })); });
    expect(within(how()).getByRole('button', { name: /^UPI ₹/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'UPI ID and amount on this QR' })).toBeTruthy();
    expect(document.querySelector('[data-qr]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm payment' }).hasAttribute('disabled')).toBe(false);
  });
  it('Split reveals the boxes, slider, calculator and Tip/Waive; Tip or waive is one tap away in Cash mode', async () => {
    await payScreen();
    tap('Split');
    expect(screen.getByRole('slider', { name: 'Cash and UPI split' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Calculator' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^\+ Tip/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^− Waive/ })).toBeTruthy();
    act(() => { fireEvent.click(within(how()).getByRole('button', { name: 'Cash' })); });
    expect(screen.queryByRole('slider', { name: 'Cash and UPI split' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tip or waive' })).toBeTruthy();
    tap('Tip or waive');
    expect(screen.getByRole('button', { name: /^\+ Tip/ })).toBeTruthy();
  });
  it('Count notes is hidden by default when Cash is due, and this phone remembers if it was opened', async () => {
    const storage = memoryStorage();
    await payScreen({ storage });
    tap(/^Cash ₹/);
    const head = screen.getByRole('button', { name: 'Count notes' });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Add a ₹100 note' })).toBeNull();
    tap('Count notes');
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add a ₹100 note' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a ₹100 note' }));
    cleanup();
    await payScreen({ storage });
    tap(/^Cash ₹/);
    expect(screen.getByRole('button', { name: 'Count notes' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add a ₹100 note' })).toBeTruthy();
    // notes themselves are per order (draft); the open/closed state is what this phone remembers
  });
});
