// P3 UI: the order note, who and Unpaid reach the Kitchen and every Station look (W-25 / PK-2); line notes stay apart
// from the station chip (W-26); a new ticket glows (silent, D-P3-ALERT); Priority banner instead of a swap (W-28).
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../mock/fixtures';
import { StoreProvider } from '../../store';
import { makeTestStore, stepClock } from '../../store/testkit';
import { StationScreen } from '../station/StationScreen';
import { KitchenScreen } from './KitchenScreen';

afterEach(() => { cleanup(); });

async function seeded() {
  const { store } = makeTestStore({ now: stepClock() });
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  const send = (names: string[], note = '', client = '') => {
    s().counter.newOrder();
    for (const n of names) s().counter.addItem(id(n));
    if (note) s().counter.setOrderNote(note);
    const oid = s().ui.orderId ?? '';
    if (client) s().open.setClient(oid, client);
    s().counter.sendToKitchen();
    return oid;
  };
  return { store, s, send };
}

describe('P3 Kitchen ticket header (PK-2)', () => {
  it('the note, client and Unpaid show on the Kitchen and on all three Station looks', async () => {
    const { store, s, send } = await seeded();
    send(['Tea'], 'Takeaway · NUT ALLERGY', 'Aarav');
    render(<StoreProvider store={store}><KitchenScreen /></StoreProvider>);
    expect(screen.getByRole('note').textContent).toBe('Takeaway · NUT ALLERGY');
    expect(screen.getByText('Aarav')).toBeTruthy();
    expect(screen.getByText('Unpaid')).toBeTruthy();
    expect(screen.getByText(/^(just in|\d+ min)$/)).toBeTruthy(); // age (the test store clock is fixed in 2026)
    expect(screen.getAllByText('Beverages').length).toBe(2); // the pill + the station chip (on All only)
    cleanup();
    for (const look of ['full', 'items', 'ticket'] as const) {
      act(() => { s().setPrefs({ stationLook: look }); s().kitchen.openStation('Beverages', 'kitchen'); });
      render(<StoreProvider store={store}><StationScreen /></StoreProvider>);
      expect(screen.getByRole('note').textContent).toBe('Takeaway · NUT ALLERGY');
      expect(screen.getByRole('heading').textContent).toBe('Beverages · 1');
      cleanup();
    }
  });
  it('a ticket that arrives while the Kitchen is open glows; the ones already there do not', async () => {
    const { store, send } = await seeded();
    send(['Tea']);
    const { container } = render(<StoreProvider store={store}><KitchenScreen /></StoreProvider>);
    expect(container.querySelectorAll('article[class*="isNew"]').length).toBe(0);
    act(() => { send(['Coffee']); });
    expect(container.querySelectorAll('article[class*="isNew"]').length).toBe(1);
  });
  it('switching the station filter never makes old tickets glow (bug found in the P3 hunt)', async () => {
    const { store, s, send } = await seeded();
    send(['Samosa']); send(['Tea']);
    act(() => { s().kitchen.filterKitchen('Beverages'); });
    const { container } = render(<StoreProvider store={store}><KitchenScreen /></StoreProvider>);
    act(() => { s().kitchen.filterKitchen(null); });
    expect(container.querySelectorAll('article').length).toBe(2);
    expect(container.querySelectorAll('article[class*="isNew"]').length).toBe(0);
  });
  it('W-28: a Priority order elsewhere shows a banner; the pinned order stays on screen', async () => {
    const { store, s, send } = await seeded();
    const a = send(['Tea']);
    act(() => { s().kitchen.openStation('Beverages', 'kitchen'); });
    render(<StoreProvider store={store}><StationScreen /></StoreProvider>);
    const b = send(['Coffee']);
    act(() => { s().kitchen.togglePriority(b); });
    expect(s().ui.station?.orderId).toBe(a);
    expect(screen.getByRole('button', { name: 'Priority #002 · Open' })).toBeTruthy();
  });
});
