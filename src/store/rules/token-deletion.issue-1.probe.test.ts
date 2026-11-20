import { describe, expect, it } from 'vitest';
import type { Order } from '../../contract';
import { nextToken } from './tokens';

const order = (token: number, deleted: boolean): Order =>
  ({ token, dayId: 'probe-day', deleted }) as Order;

describe('Issue #1 — deleted order token release (diagnostic probe)', () => {
  it('makes a deleted order token available to the next order', () => {
    const range = { from: 1, to: 500 };
    expect(nextToken([order(1, true)], 'probe-day', range)).toBe(1);
  });
});
