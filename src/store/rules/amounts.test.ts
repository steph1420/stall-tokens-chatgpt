// F-45 shared tip choices / round-off steps: rupee text parsing, synced setting with CONFIG fallback.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { makeTestStore } from '../testkit';
import { amounts, parseRupees } from './amounts';

describe('shared amounts (F-45)', () => {
  it('parses rupees and rejects bad input', () => {
    expect(parseRupees('₹20, 10 10 · 50', 'tipChips')).toEqual({ ok: [1000, 2000, 5000] });
    expect(parseRupees('abc', 'tipChips')).toEqual({ error: '“abc” is not an amount' });
    expect(parseRupees('5 10 20 50', 'roundOffSteps')).toHaveProperty('error');
  });
  it('a saved list replaces the CONFIG default on every phone', async () => {
    const { store: st } = makeTestStore();
    await st.getState().start();
    expect(amounts(st.getState().folded.settings, 'tipChips')).toEqual(CONFIG.payment.tipChips);
    expect(st.getState().catalog.setAmounts('tipChips', '5, 15')).toBeNull();
    expect(amounts(st.getState().folded.settings, 'tipChips')).toEqual([500, 1500]);
  });
});
