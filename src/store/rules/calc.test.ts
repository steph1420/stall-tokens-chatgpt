import { describe, expect, it } from 'vitest';
import { calcPaise, calcStart, press, type Calc, type CalcKey } from './calc';

const run = (keys: string): Calc => keys.split(' ').filter(Boolean).reduce((c, k) => press(c, k as CalcKey), calcStart);

describe('pay3 calculator', () => {
  it('adds, takes away, multiplies, divides', () => {
    expect(run('1 2 0 + 8 0 =').shown).toBe('200');
    expect(run('5 0 0 − 2 4 0 =').shown).toBe('260');
    expect(run('3 5 × 4 =').shown).toBe('140');
    expect(run('1 0 0 ÷ 3 =').shown).toBe('33.33');
  });
  it('chains left to right like a pocket calculator', () => {
    expect(run('2 + 3 × 4 =').shown).toBe('20');
    expect(run('2 + 3 +').shown).toBe('5');
  });
  it('decimals, one point only', () => {
    expect(run('1 . 5 . 5 + . 5 =').shown).toBe('2.05');
  });
  it('divide by zero shows a calm message and clears', () => {
    const c = run('9 ÷ 0 =');
    expect(c.error).toBe("Can't divide by 0");
    expect(c.shown).toBe('0');
    expect(calcPaise(c)).toBeNull();
    expect(press(c, '7').shown).toBe('7');
  });
  it('C clears, backspace removes the last digit, digits are capped', () => {
    expect(run('1 2 3 C').shown).toBe('0');
    expect(run('1 2 3 del').shown).toBe('12');
    expect(run('1 del del').shown).toBe('0');
    expect(run('9 9 9 9 9 9 9 9 9 9 9 9 9 9').shown).toBe('999999999999');
  });
  it('gives paise for Use as Cash / UPI; nothing for 0 or negative', () => {
    expect(calcPaise(run('1 2 . 5'))).toBe(1250);
    expect(calcPaise(run('5 − 9 ='))).toBeNull();
    expect(calcPaise(calcStart)).toBeNull();
  });
});
