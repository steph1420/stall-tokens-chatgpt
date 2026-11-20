import { describe, expect, it } from 'vitest';
import { buildReceiptRows, DEFAULT_RECEIPT_TEMPLATE, moveReceiptBlock, parseReceiptTemplate, type ReceiptTemplate } from './receiptTemplate';

describe('receipt template engine', () => {
  it('expands only populated variables and line items', () => {
    const rows = buildReceiptRows(DEFAULT_RECEIPT_TEMPLATE, {
      values: { businessName: 'Momo Bus', token: '#012', total: '₹240', thankYouNote: 'See you again' },
      items: [{ name: 'Veg Momos', quantity: 2, rate: '₹100', amount: '₹200' }],
    });
    const plain = rows.filter((x) => x.type === 'text').map((x) => x.type === 'text' ? x.left + (x.right ?? '') : '');
    expect(plain).toContain('Momo Bus');
    expect(plain).toContain('#012');
    expect(plain).toContain('2 × Veg Momos');
    expect(plain).toContain('TOTAL₹240');
    expect(plain).not.toContain('undefined');
  });

  it('round-trips a saved template and rejects malformed data safely', () => {
    const saved = JSON.stringify({ ...DEFAULT_RECEIPT_TEMPLATE, paperWidth: 80 });
    expect(parseReceiptTemplate(saved).paperWidth).toBe(80);
    expect(parseReceiptTemplate('{broken').blocks).toEqual(DEFAULT_RECEIPT_TEMPLATE.blocks);
    expect(parseReceiptTemplate(undefined)).toEqual(DEFAULT_RECEIPT_TEMPLATE);
  });

  it('moves blocks without changing their contents', () => {
    const blocks = DEFAULT_RECEIPT_TEMPLATE.blocks;
    const moved = moveReceiptBlock(blocks, 0, 1);
    expect(moved[0]).toEqual(blocks[1]);
    expect(moved[1]).toEqual(blocks[0]);
    expect(moved.length).toBe(blocks.length);
    expect(moveReceiptBlock(blocks, 0, -1)).toEqual([...blocks]);
  });

  it('keeps supported image blocks in the template', () => {
    const template: ReceiptTemplate = { ...DEFAULT_RECEIPT_TEMPLATE, blocks: [{ id: 'logo', type: 'image', dataUrl: 'data:image/png;base64,AA==', widthDots: 256 }] };
    const loaded = parseReceiptTemplate(JSON.stringify(template));
    expect(loaded.blocks).toEqual(template.blocks);
    expect(buildReceiptRows(loaded, { values: {}, items: [] })[0]).toMatchObject({ type: 'image', widthDots: 256 });
  });
});
