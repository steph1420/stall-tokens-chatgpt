import { describe, expect, it } from 'vitest';
import { pick, reducedTransition } from './index';
import { SPRINGS } from './tokens';

describe('motion', () => {
  it('takes springs from the motion tokens', () => {
    expect(pick('smooth', false)).toEqual(SPRINGS.smooth);
    expect(pick('snappy', false)).toMatchObject({ type: 'spring' });
  });
  it('falls back to a short fade when reduced motion is on', () => {
    expect(pick('smooth', true)).toBe(reducedTransition);
    expect(reducedTransition).not.toHaveProperty('type');
  });
});
