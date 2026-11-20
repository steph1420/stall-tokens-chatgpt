import { describe, expect, it } from 'vitest';
import { formatQrAmount, isUpiId, readUpiLink, upiLink, upiQrFacts } from './upi';

describe('UPI link (F-15)', () => {
  it('builds upi://pay with pa, pn, am, cu and tn', () => {
    const link = upiLink('stall@okbank', 'Fair Stall', 8000, 'Token #047');
    expect(link).toBe('upi://pay?pa=stall%40okbank&pn=Fair%20Stall&am=80.00&cu=INR&tn=Token%20%23047');
  });
  it('checks UPI IDs', () => {
    expect(isUpiId('name.1@okicici')).toBe(true);
    for (const bad of ['', 'name', '@bank', 'a b@bank', 'name@', 'x@1bank']) expect(isUpiId(bad)).toBe(false);
  });
});

describe('UPI QR label (F-15): text is read back from the link', () => {
  const cases: { id: string; name: string; paise: number; am: string; text: string }[] = [
    { id: 'stall@okbank', name: 'Fair Stall', paise: 8000, am: '80.00', text: '₹80' },
    { id: 'stall@okbank', name: 'Fair Stall', paise: 18000, am: '180.00', text: '₹180' },
    { id: 'stall@okbank', name: 'Fair Stall', paise: 18050, am: '180.50', text: '₹180.50' },
    { id: 'stall@okbank', name: 'Fair Stall', paise: 1, am: '0.01', text: '₹0.01' },
    { id: 'name.1-ok_2@okicici', name: 'A & B Stall', paise: 1050, am: '10.50', text: '₹10.50' },
  ];
  it('read pa and am match what upiLink encoded, for whole rupees, paise and special-char IDs', () => {
    for (const c of cases) {
      const link = upiLink(c.id, c.name, c.paise, 'Token #001');
      expect(readUpiLink(link)).toEqual({ upiId: c.id, amount: c.am });
      expect(upiQrFacts(link)).toEqual({ upiId: c.id, amountText: c.text });
    }
  });
  it('formatQrAmount shows paise only when the link has them', () => {
    expect(formatQrAmount('180.00')).toBe('₹180');
    expect(formatQrAmount('180')).toBe('₹180');
    expect(formatQrAmount('180.50')).toBe('₹180.50');
    expect(formatQrAmount('0.50')).toBe('₹0.50');
  });
  it('returns null when pa or am is missing', () => {
    expect(readUpiLink('upi://pay?cu=INR')).toBeNull();
    expect(upiQrFacts('not a link')).toBeNull();
  });
});
