// Bundle E tests: Next Order Switch Delay (0-10s, default 2s), cancellation, Open Orders Priority control, and Station cycling
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { StoreProvider } from '../../store';
import { DEMO_MENU } from '../../mock/fixtures';
import { makeTestStore, stepClock } from '../../store/testkit';
import { OpenOrdersScreen } from '../counter/open/OpenOrdersScreen';
import { StationScreen } from '../station/StationScreen';
import { StatusMark } from './StatusMark';
import { STATUS_WORD } from '../../store/rules/kitchen';

describe('Bundle E: Configurable Next Order Switch Delay & Priority Control', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function createFixture() {
    const t = makeTestStore({ now: stepClock() });
    await t.store.getState().start();
    const s = () => t.store.getState();
    for (const m of DEMO_MENU) {
      s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
    }
    const idOf = (name: string) => Object.values(s().folded.items).find((i) => i.name === name)?.id ?? '';
    const send = (...names: string[]) => {
      s().counter.newOrder();
      for (const n of names) s().counter.addItem(idOf(n));
      s().counter.sendToKitchen();
      return s().ui.orderId ?? '';
    };
    return { store: t.store, s, send };
  }

  it('defaults nextOrderDelaySec to 2s, configurable via preferences from 0 to 10s', async () => {
    const { s } = await createFixture();
    expect(s().prefs.nextOrderDelaySec).toBe(2);

    s().setPrefs({ nextOrderDelaySec: 5 });
    expect(s().prefs.nextOrderDelaySec).toBe(5);

    s().setPrefs({ nextOrderDelaySec: 0 });
    expect(s().prefs.nextOrderDelaySec).toBe(0);
  });

  it('with 2s delay, next order moves to Preparing only after 2s countdown', async () => {
    const { s, send } = await createFixture();
    s().setPrefs({ nextOrderDelaySec: 2 });
    const a = send('Tea');
    const b = send('Coffee');

    const tea = s().folded.orders[a]?.lines[0]?.lineId ?? '';
    s().kitchen.advance(a, tea); // Waiting -> Preparing
    expect(s().folded.orders[a]?.lines[0]?.status).toBe('preparing');

    // Tapping again moves to done? (Ready), which triggers the 2s countdown for Beverages
    s().kitchen.advance(a, tea);
    expect(s().folded.orders[a]?.lines[0]?.status).toBe('done?');
    expect(s().kitchen.hasPendingDelay('Beverages')).toBe(true);

    // Order b is still waiting immediately after order a reached ready
    expect(s().folded.orders[b]?.lines[0]?.status).toBe('waiting');

    // Advance timer by 1s (halfway)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(s().folded.orders[b]?.lines[0]?.status).toBe('waiting');
    expect(s().kitchen.hasPendingDelay('Beverages')).toBe(true);

    // Advance timer by another 1s (total 2s)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(s().folded.orders[b]?.lines[0]?.status).toBe('preparing');
    expect(s().kitchen.hasPendingDelay('Beverages')).toBe(false);
  });

  it('with 0s delay, next order transitions to Preparing immediately', async () => {
    const { s, send } = await createFixture();
    s().setPrefs({ nextOrderDelaySec: 0 });
    const a = send('Tea');
    const b = send('Coffee');

    const tea = s().folded.orders[a]?.lines[0]?.lineId ?? '';
    s().kitchen.advance(a, tea); // Waiting -> Preparing
    s().kitchen.advance(a, tea); // Preparing -> done? (Ready)

    // With 0s delay, order b moves immediately
    expect(s().folded.orders[b]?.lines[0]?.status).toBe('preparing');
  });

  it('cancels pending countdown if triggering order is sent back before delay expires', async () => {
    const { s, send } = await createFixture();
    s().setPrefs({ nextOrderDelaySec: 3 });
    const a = send('Tea');
    const b = send('Coffee');

    const tea = s().folded.orders[a]?.lines[0]?.lineId ?? '';
    s().kitchen.advance(a, tea);
    s().kitchen.advance(a, tea); // Ready
    expect(s().kitchen.hasPendingDelay('Beverages')).toBe(true);

    // 1s in, Counter sends order a back to the kitchen
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    s().kitchen.sendBack(a);

    // Timer was cancelled
    expect(s().kitchen.hasPendingDelay('Beverages')).toBe(false);

    // Even after remaining 5 seconds pass, order b must remain Waiting
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(s().folded.orders[b]?.lines[0]?.status).toBe('waiting');
    expect(s().folded.orders[a]?.lines[0]?.status).toBe('preparing');
  });

  it('renames Done? to Ready in StatusMark and STATUS_WORD', () => {
    expect(STATUS_WORD['done?']).toBe('Ready');
    render(<StatusMark mark="done?" />);
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('provides direct Priority toggle control in Open Orders screen', async () => {
    const { store, s, send } = await createFixture();
    const a = send('Tea');
    s().open.showOpen(a);

    render(
      <StoreProvider store={store}>
        <OpenOrdersScreen />
      </StoreProvider>
    );

    const prioBtn = screen.getByRole('button', { name: /priority for #001/i });
    expect(prioBtn).toBeTruthy();
    expect(s().folded.orders[a]?.priority).toBe(false);

    // Tap to turn priority on
    fireEvent.click(prioBtn);
    expect(s().folded.orders[a]?.priority).toBe(true);

    // Tap to turn priority off
    fireEvent.click(prioBtn);
    expect(s().folded.orders[a]?.priority).toBe(false);
  });

  it('provides tap cycling chevrons in Station order tabs', async () => {
    const { store, s, send } = await createFixture();
    const a = send('Tea');
    const b = send('Coffee');
    s().kitchen.openStation('Beverages', 'launch');

    render(
      <StoreProvider store={store}>
        <StationScreen />
      </StoreProvider>
    );

    const prevBtn = screen.getByRole('button', { name: /previous order/i });
    const nextBtn = screen.getByRole('button', { name: /next order/i });
    expect(prevBtn).toBeTruthy();
    expect(nextBtn).toBeTruthy();

    expect(s().ui.station?.orderId).toBe(a);
    fireEvent.click(nextBtn);
    expect(s().ui.station?.orderId).toBe(b);
    fireEvent.click(prevBtn);
    expect(s().ui.station?.orderId).toBe(a);
  });
});
