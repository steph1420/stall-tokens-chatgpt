// F-15: the UPI ID and amount next to the QR are parsed from the same link the QR encodes.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../../mock/fixtures';
import { StoreProvider, readUpiLink, upiQrFacts } from '../../../store';
import { makeTestStore } from '../../../store/testkit';
import { Toast } from '../../kit/Toast';
import { CounterShell } from '../CounterShell';

afterEach(cleanup);

async function payScreen(payees: [string, string][] = [['Stall One', 'stallone@okbank']]) {
  const { store } = makeTestStore();
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  for (const [name, id] of payees) s().catalog.savePayee(null, name, id);
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } }));
  act(() => { for (let i = 0; i < 4; i++) s().counter.addItem(id('Tea')); s().counter.sendToKitchen(); s().counter.setPage('payment'); });
  render(<StoreProvider store={store}><CounterShell /><Toast /></StoreProvider>);
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Split' })); });
  return { s };
}

const tap = (name: string | RegExp) => { act(() => { fireEvent.click(screen.getByRole('button', { name })); }); };
const chip = (g: string, i: number) => { act(() => { fireEvent.click(within(screen.getByRole('group', { name: g })).getAllByRole('button')[i] as HTMLElement); }); };
const typeUpi = (digits: string) => {
  tap(/^UPI ₹/);
  for (const k of digits) tap(k);
  tap('Done');
};
const qrLink = () => document.querySelector('[data-qr]')?.getAttribute('data-qr') ?? '';
const factsOnScreen = () => {
  const g = screen.getByRole('group', { name: 'UPI ID and amount on this QR' });
  return { id: g.querySelector('span')?.textContent ?? '', amount: g.querySelectorAll('span')[1]?.textContent ?? '', g };
};
const expectLabelMatchesQr = () => {
  const link = qrLink();
  const parsed = readUpiLink(link);
  const facts = upiQrFacts(link);
  const shown = factsOnScreen();
  expect(parsed).toBeTruthy();
  expect(facts).toBeTruthy();
  expect(shown.id).toBe(parsed?.upiId);
  expect(shown.amount).toBe(facts?.amountText);
  expect(shown.amount).toBeTruthy();
  return { link, parsed, facts, shown };
};

describe('QR label is tied to the encoded link (F-15)', () => {
  it('hides the QR while UPI is ₹0, then shows the ID and amount from the link', async () => {
    await payScreen();
    expect(screen.queryByRole('img', { name: /Payment QR/ })).toBeNull();
    typeUpi('30');
    const { parsed, shown } = expectLabelMatchesQr();
    expect(shown.id).toBe('stallone@okbank');
    expect(shown.amount).toBe('₹30');
    expect(parsed?.amount).toBe('30.00');
  });

  it('updates live when the split changes via the numpad and the slider', async () => {
    await payScreen();
    typeUpi('30');
    expect(factsOnScreen().amount).toBe('₹30');
    typeUpi('45');
    expect(expectLabelMatchesQr().shown.amount).toBe('₹45');
    const slider = screen.getByRole('slider', { name: 'Cash and UPI split' });
    act(() => { fireEvent.keyDown(slider, { key: 'ArrowRight' }); });
    const after = expectLabelMatchesQr();
    expect(after.shown.amount).not.toBe('₹45');
    expect(Number(after.parsed?.amount)).toBeGreaterThan(45);
  });

  it('stays in step after + Tip, − Waive, and a locked side', async () => {
    await payScreen();
    typeUpi('30');
    tap('Lock UPI');
    tap(/^\+ Tip/);
    chip('Tip', 0);
    expect(expectLabelMatchesQr().shown.amount).toBe('₹30');
    tap('Unlock UPI');
    tap('Lock Cash');
    tap(/^− Waive/);
    chip('Waive', 0);
    const after = expectLabelMatchesQr();
    expect(after.shown.amount).toBe('₹20');
    expect(after.parsed?.amount).toBe('20.00');
  });

  it('shows paise when the link has them, and the ID when it has dots, a hyphen and an underscore', async () => {
    await payScreen([['Dot stall', 'name.1-ok_2@okicici']]);
    tap('Calculator');
    for (const k of ['1', '0', 'Point', '5']) tap(k);
    tap('Use as UPI');
    const { parsed, shown } = expectLabelMatchesQr();
    expect(shown.id).toBe('name.1-ok_2@okicici');
    expect(parsed?.upiId).toBe('name.1-ok_2@okicici');
    expect(parsed?.amount).toBe('10.50');
    expect(shown.amount).toBe('₹10.50');
  });
});
