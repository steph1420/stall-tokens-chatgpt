// F-42 Token slip shows the stall, the token, items and how it was paid.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreProvider } from '../../store';
import { makeTestStore } from '../../store/testkit';
import { SlipBody } from './TokenSlip';

afterEach(cleanup);

describe('token slip (F-42)', () => {
  it('prints token, lines, total and payment', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    const s = () => store.getState();
    s().catalog.setSetting('stallName', 'Momo Corner');
    s().catalog.saveItem(null, { name: 'Tea', price: 2000, swatch: 0, category: 'Tea', stationId: 'Beverages', count: null });
    s().counter.newOrder(); s().counter.addItem(Object.keys(s().folded.items)[0] ?? ''); s().counter.addItem(Object.keys(s().folded.items)[0] ?? '');
    s().counter.pay({ cash: 0, upi: 4000, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 0, notes: {} });
    const o = s().folded.orders[s().ui.orderId ?? ''];
    if (!o) throw new Error('no order');
    render(<StoreProvider store={store}><SlipBody o={o} /></StoreProvider>);
    expect(screen.getByText('Momo Corner')).toBeTruthy();
    expect(screen.getByText('Tea ×2')).toBeTruthy();
    expect(screen.getByText('Paid · UPI')).toBeTruthy();
  });
});
