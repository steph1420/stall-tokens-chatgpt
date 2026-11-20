// P3b tablet layout: two panes from 48 rem wide (and 30 rem tall); a phone, a phone on its side and 200 % text keep one column.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../mock/fixtures';
import { StoreProvider } from '../../store';
import { makeTestStore } from '../../store/testkit';
import { CounterShell } from './CounterShell';

const size = (w: number, h: number) => { Object.assign(window, { innerWidth: w, innerHeight: h }); };
afterEach(() => { cleanup(); size(1024, 768); document.documentElement.style.fontSize = ''; });

async function shell() {
  const { store } = makeTestStore();
  await store.getState().start();
  for (const m of DEMO_MENU) store.getState().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } }));
  render(<StoreProvider store={store}><CounterShell /></StoreProvider>);
  return store;
}

describe('P3b tablet layout', () => {
  it('tablet: menu beside the bill, Menu tab gone, the bill fills as items are tapped', async () => {
    size(1180, 820);
    const store = await shell();
    expect(screen.getByLabelText('Order')).toBeTruthy();
    expect(screen.getByText(/The bill shows here/)).toBeTruthy();
    const tea = Object.values(store.getState().folded.items).find((i) => i.name === 'Tea')?.id ?? '';
    act(() => { store.getState().counter.addItem(tea); });
    expect(store.getState().ui.orderId).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu', exact: true } as never)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'To kitchen' }).length).toBeGreaterThan(0);
  });
  it('phone, phone on its side, and 200 % text on a tablet keep one column', async () => {
    for (const [w, h, font] of [[421, 927, ''], [927, 421, ''], [820, 1180, '200%']] as const) {
      size(w, h); document.documentElement.style.fontSize = font;
      await shell();
      expect(screen.queryByLabelText('Order')).toBeNull();
      expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
      cleanup();
    }
  });
});
