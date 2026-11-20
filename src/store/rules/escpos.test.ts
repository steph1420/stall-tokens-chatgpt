// F-41 ESC/POS slip bytes: init, big token, 32-column ASCII lines with "Rs", feed and cut.
import { describe, expect, it } from 'vitest';
import { escposSlip } from './escpos';

describe('ESC/POS token slip (F-41)', () => {
  it('builds printer bytes a 58 mm printer understands', () => {
    const b = escposSlip({ stall: 'Momo Corner', token: '046', meta: '19:41 · Priya', lines: [['Veg momos ×2', '₹120'], ['A very long item name that goes on', '₹60']], total: '₹180', paid: 'Paid · UPI' });
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const text = new TextDecoder('ascii').decode(b);
    expect(text).toContain(`Veg momos x2${' '.repeat(14)}Rs 120`);
    expect(text.split('\n').filter((l) => l.includes('Rs 60'))[0]).toHaveLength(32);
    expect([...b].every((x) => x < 0x80)).toBe(true);
  });
  it('encodes variable-driven rows for both 58 mm and 80 mm profiles', async () => {
    const { escposReceipt } = await import('./escpos');
    const rows = [
      { type: 'text' as const, left: 'Momo Bus', align: 'center' as const, bold: true, large: true },
      { type: 'text' as const, left: 'Total', right: 'Rs 120', align: 'left' as const, bold: true, large: false },
    ];
    const narrow = new TextDecoder('ascii').decode(escposReceipt(rows, 58));
    const wide = new TextDecoder('ascii').decode(escposReceipt(rows, 80));
    expect(narrow).toContain('Momo Bus');
    expect(narrow).toContain('Total');
    expect(wide).toContain('Momo Bus');
    expect([...escposReceipt(rows, 58)].slice(-4)).not.toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('converts logo pixels to a valid printer raster command', async () => {
    const { rgbaToMonochrome, escposRasterImage } = await import('./escpos');
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    const packed = rgbaToMonochrome(rgba, 4, 1);
    expect([...packed]).toEqual([0b10010000]);
    expect([...escposRasterImage(4, 1, packed)]).toEqual([0x1d, 0x76, 0x30, 0, 1, 0, 1, 0, 0b10010000]);
  });

});
