// F-19 / F-21 UI: pills and counts, "Open <station>" only when a pill is picked (Q-OPEN-1 A), station tap flow.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_MENU } from '../../mock/fixtures';
import { StoreProvider } from '../../store';
import { makeTestStore, stepClock } from '../../store/testkit';
import { StationScreen } from '../station/StationScreen';
import { KitchenScreen } from './KitchenScreen';

afterEach(() => { cleanup(); vi.useRealTimers(); });

async function seeded() {
  const { store } = makeTestStore({ now: stepClock() });
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const id = (n: string) => Object.values(s().folded.items).find((i) => i.name === n)?.id ?? '';
  s().counter.newOrder(); s().counter.addItem(id('Tea')); s().counter.addItem(id('Samosa')); s().counter.sendToKitchen();
  return store;
}

describe('Kitchen and Station screens', () => {
  it('shows to-make counts and the Open button only for a picked station', async () => {
    const store = await seeded();
    render(<StoreProvider store={store}><KitchenScreen /></StoreProvider>);
    expect(screen.getByRole('button', { name: /All\s*2/ })).toBeTruthy();
    expect(screen.queryByText(/^Open /)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Beverages\s*1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Open Beverages/ }));
    expect(store.getState().ui.screen).toBe('station');
  });

  it('a tap at the station moves the own line on; other stations stay muted', async () => {
    const store = await seeded();
    act(() => { store.getState().kitchen.openStation('Beverages', 'launch'); });
    render(<StoreProvider store={store}><StationScreen /></StoreProvider>);
    const tea = screen.getByRole('button', { name: /^Tea:/ });
    expect(screen.queryByRole('button', { name: /^Samosa:/ })).toBeNull(); // Cutlets line is shown, not tappable
    expect(screen.getByText('1× Samosa')).toBeTruthy();
    act(() => { fireEvent.pointerDown(tea, { clientX: 5, clientY: 5 }); fireEvent.pointerUp(tea); });
    expect(screen.getAllByText('Preparing').length).toBeGreaterThan(0);
  });
  it('an order whose lines are all complete shows Completed for a moment, then drops off (Q-OVERLAY)', async () => {
    const store = await seeded();
    render(<StoreProvider store={store}><KitchenScreen /></StoreProvider>);
    vi.useFakeTimers();
    const o = Object.values(store.getState().folded.orders)[0];
    act(() => { for (const l of o?.lines ?? []) store.getState().kitchen.finishLine(o?.id ?? '', l.lineId); });
    expect(screen.getAllByText('Marked by counter').length).toBe(2);
    expect(screen.queryByRole('status')).toBeNull(); // Q-COMPLETE-2 A: Ready never completes; the card stays
    act(() => { for (const l of o?.lines ?? []) store.getState().kitchen.advance(o?.id ?? '', l.lineId); }); // hand over
    expect(screen.getByRole('status').textContent).toBe('Completed'); // every line handed over: veil over the last view
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.getByText('Nothing to make right now')).toBeTruthy();
  });
});
