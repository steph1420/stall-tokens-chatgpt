// Bundle D: Billing Tip/Waive & Fast Order Cycling tests.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_MENU } from '../../mock/fixtures';
import { StoreProvider } from '../../store';
import { makeTestStore } from '../../store/testkit';
import { Toast } from '../kit/Toast';
import { CounterShell } from './CounterShell';

afterEach(cleanup);

async function setupCounter() {
  const { store } = makeTestStore();
  await store.getState().start();
  const s = () => store.getState();
  for (const m of DEMO_MENU) {
    s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  }
  const teaId = Object.values(s().folded.items).find((i) => i.name === 'Tea')?.id ?? '';
  store.setState((x) => ({ ui: { ...x.ui, screen: 'counter' } }));
  return { store, s, teaId };
}

describe('Bundle D: Fast Order Cycling', () => {
  it('shows cycling controls ‹ #001 · #002 › when multiple open orders exist and allows fast switching', async () => {
    const { store, s, teaId } = await setupCounter();

    // Create Order #001 with 2 teas
    act(() => {
      s().counter.addItem(teaId);
      s().counter.addItem(teaId);
    });
    const order1Id = s().ui.orderId ?? '';

    // Create Order #002 with 1 tea
    act(() => {
      s().counter.newOrder();
      s().counter.addItem(teaId);
    });
    const order2Id = s().ui.orderId ?? '';
    expect(order1Id).not.toBe(order2Id);

    render(
      <StoreProvider store={store}>
        <CounterShell />
        <Toast />
      </StoreProvider>,
    );

    // Current order is #002, cycling control shows ‹ #002 · #001 ›
    const cycleGroup = screen.getByRole('group', { name: 'Order cycling' });
    expect(cycleGroup).toBeTruthy();
    expect(within(cycleGroup).getByText('#002')).toBeTruthy();
    expect(within(cycleGroup).getByText('#001')).toBeTruthy();

    // Tap ‹ to switch to #001
    act(() => {
      fireEvent.click(within(cycleGroup).getByRole('button', { name: /Previous order/ }));
    });
    expect(s().ui.orderId).toBe(order1Id);

    // Now current order is #001, cycling shows ‹ #001 · #002 ›
    expect(within(cycleGroup).getByText('#001')).toBeTruthy();
    expect(within(cycleGroup).getByText('#002')).toBeTruthy();

    // Tap the #002 token button directly to switch back
    act(() => {
      fireEvent.click(within(cycleGroup).getByRole('button', { name: /Switch to order/ }));
    });
    expect(s().ui.orderId).toBe(order2Id);

    // Drafts sheet was never opened
    expect(screen.queryByRole('dialog', { name: 'Drafts' })).toBeNull();
  });
});

describe('Bundle D: Billing Tip and Waive', () => {
  it('allows setting tip and waive directly in billing and syncs to payment screen', async () => {
    const { store, s, teaId } = await setupCounter();

    // Create Order #001 with 2 teas (₹40)
    act(() => {
      s().counter.addItem(teaId);
      s().counter.addItem(teaId);
      s().counter.setPage('billing');
    });

    render(
      <StoreProvider store={store}>
        <CounterShell />
        <Toast />
      </StoreProvider>,
    );

    // Tip or waive button is present in billing
    const tipWaiveBtn = screen.getByRole('button', { name: /Tip or waive/ });
    expect(tipWaiveBtn).toBeTruthy();

    // Click Tip or waive button to open AdjustSheet
    act(() => {
      fireEvent.click(tipWaiveBtn);
    });

    // Sheet opens
    expect(screen.getByRole('dialog', { name: 'Discount and round-off' })).toBeTruthy();
    expect(screen.getByText('Tip and waive')).toBeTruthy();

    // Click +₹10 tip chip
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '+₹10' }));
    });

    // Click Apply tip / waive
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply tip / waive' }));
    });

    // Close sheet
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    // In billing totals, Tip +₹10 is shown and Total is updated
    expect(screen.getByText('Tip')).toBeTruthy();
    expect(screen.getByText(/Edit tip \/ waive/)).toBeTruthy();

    // Switch to Payment page
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
    });

    // Payment screen initializes with the ₹10 tip already set from billing
    expect(screen.getByText('To collect').parentElement?.textContent).toMatch(/tip \+₹10/);
  });

  it('allocates proportionate column spans in billing totals table footer', async () => {
    const { store, s, teaId } = await setupCounter();
    act(() => {
      s().counter.addItem(teaId);
      s().counter.setPage('billing');
    });

    render(
      <StoreProvider store={store}>
        <CounterShell />
      </StoreProvider>,
    );

    const subtotalRow = screen.getByText('Subtotal').closest('tr');
    expect(subtotalRow).toBeTruthy();
    const subCells = Array.from(subtotalRow?.querySelectorAll('td') ?? []);
    expect(subCells[0]?.colSpan).toBe(3);
    expect(subCells[1]?.colSpan).toBe(2);

    const totalRow = screen.getByText('Total').closest('tr');
    expect(totalRow).toBeTruthy();
    const totCells = Array.from(totalRow?.querySelectorAll('td') ?? []);
    expect(totCells[0]?.colSpan).toBe(3);
    expect(totCells[1]?.colSpan).toBe(2);
  });
});
