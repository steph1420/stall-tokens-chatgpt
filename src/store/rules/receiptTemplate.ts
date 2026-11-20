// POS receipt templates: a small, portable document model shared by thermal and browser printing.
export const PRINT_VARIABLES = [
  ['businessName', 'Business / bus name'], ['eventName', 'Event name'], ['address', 'Address'],
  ['contact', 'Contact number'], ['slogan', 'Slogan'], ['welcomeNote', 'Welcome note'],
  ['token', 'Token number'], ['dateTime', 'Date and time'], ['customerName', 'Customer name'],
  ['orderNote', 'Overall order note'], ['subtotal', 'Subtotal'], ['discount', 'Discount'],
  ['total', 'Grand total'], ['paymentMode', 'Payment method'], ['paid', 'Amount paid'],
  ['balance', 'Balance due'], ['thankYouNote', 'Thank-you note'],
] as const;
export type PrintVariable = (typeof PRINT_VARIABLES)[number][0];
export type ReceiptBlock =
  | { readonly id: string; readonly type: 'variable'; readonly key: PrintVariable; readonly align?: 'left' | 'center' | 'right'; readonly bold?: boolean; readonly large?: boolean }
  | { readonly id: string; readonly type: 'text'; readonly text: string; readonly align?: 'left' | 'center' | 'right'; readonly bold?: boolean }
  | { readonly id: string; readonly type: 'divider' }
  | { readonly id: string; readonly type: 'items' }
  | { readonly id: string; readonly type: 'image'; readonly dataUrl: string; readonly widthDots: number };
export interface ReceiptTemplate { readonly version: 1; readonly paperWidth: 58 | 80; readonly blocks: readonly ReceiptBlock[] }
export interface ReceiptItem { readonly name: string; readonly quantity: number; readonly unit?: string; readonly rate: string; readonly amount: string; readonly note?: string }
export interface ReceiptContext {
  readonly values: Readonly<Partial<Record<PrintVariable, string>>>;
  readonly items: readonly ReceiptItem[];
}
export type ReceiptRow =
  | { readonly type: 'text'; readonly left: string; readonly right?: string; readonly align: 'left' | 'center' | 'right'; readonly bold: boolean; readonly large: boolean }
  | { readonly type: 'divider' }
  | { readonly type: 'image'; readonly dataUrl: string; readonly widthDots: number };

const variable = (id: string, key: PrintVariable, extra: Partial<Extract<ReceiptBlock, { type: 'variable' }>> = {}): ReceiptBlock =>
  ({ id, type: 'variable', key, ...extra });
export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  version: 1,
  paperWidth: 58,
  blocks: [
    variable('b-business', 'businessName', { align: 'center', bold: true, large: true }),
    variable('b-event', 'eventName', { align: 'center', bold: true }),
    variable('b-slogan', 'slogan', { align: 'center' }),
    variable('b-address', 'address', { align: 'center' }),
    variable('b-contact', 'contact', { align: 'center' }),
    variable('b-welcome', 'welcomeNote', { align: 'center' }),
    { id: 'b-rule-1', type: 'divider' },
    variable('b-token', 'token', { align: 'center', bold: true, large: true }),
    variable('b-date', 'dateTime', { align: 'center' }),
    variable('b-customer', 'customerName'),
    { id: 'b-items', type: 'items' },
    variable('b-order-note', 'orderNote'),
    { id: 'b-rule-2', type: 'divider' },
    variable('b-subtotal', 'subtotal'),
    variable('b-discount', 'discount'),
    variable('b-total', 'total', { bold: true, large: true }),
    variable('b-payment', 'paymentMode'),
    variable('b-paid', 'paid'),
    variable('b-balance', 'balance'),
    variable('b-thanks', 'thankYouNote', { align: 'center', bold: true }),
  ],
};

export function parseReceiptTemplate(raw: string | undefined): ReceiptTemplate {
  if (!raw) return DEFAULT_RECEIPT_TEMPLATE;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return DEFAULT_RECEIPT_TEMPLATE;
    const x = v as Partial<ReceiptTemplate>;
    if (x.version !== 1 || (x.paperWidth !== 58 && x.paperWidth !== 80) || !Array.isArray(x.blocks)) return DEFAULT_RECEIPT_TEMPLATE;
    const allowed = new Set<string>(PRINT_VARIABLES.map(([key]) => key));
    const blocks = x.blocks.filter((b): b is ReceiptBlock => {
      if (typeof b !== 'object' || b === null || typeof b.id !== 'string' || typeof b.type !== 'string') return false;
      if (b.type === 'divider' || b.type === 'items') return true;
      if (b.type === 'text') return typeof b.text === 'string';
      if (b.type === 'image') return typeof b.dataUrl === 'string' && b.dataUrl.startsWith('data:image/') && Number.isInteger(b.widthDots);
      return b.type === 'variable' && typeof b.key === 'string' && allowed.has(b.key);
    });
    return { version: 1, paperWidth: x.paperWidth, blocks };
  } catch {
    return DEFAULT_RECEIPT_TEMPLATE;
  }
}

export function buildReceiptRows(template: ReceiptTemplate, context: ReceiptContext): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  for (const block of template.blocks) {
    if (block.type === 'divider') { rows.push({ type: 'divider' }); continue; }
    if (block.type === 'image') { rows.push({ type: 'image', dataUrl: block.dataUrl, widthDots: block.widthDots }); continue; }
    if (block.type === 'items') {
      for (const item of context.items) {
        const unit = item.unit ? ` ${item.unit}` : '';
        rows.push({ type: 'text', left: `${item.quantity} × ${item.name}${unit}`, right: item.amount, align: 'left', bold: false, large: false });
        rows.push({ type: 'text', left: `  @ ${item.rate}`, align: 'left', bold: false, large: false });
        if (item.note) rows.push({ type: 'text', left: `  Note: ${item.note}`, align: 'left', bold: false, large: false });
      }
      continue;
    }
    if (block.type === 'text') {
      if (block.text.trim()) rows.push({ type: 'text', left: block.text, align: block.align ?? 'left', bold: block.bold ?? false, large: false });
      continue;
    }
    const value = context.values[block.key] ?? '';
    if (!value.trim()) continue;
    const paired = ['subtotal', 'discount', 'total', 'paid', 'balance'].includes(block.key);
    rows.push({
      type: 'text',
      left: paired ? ({ subtotal: 'Subtotal', discount: 'Discount', total: 'TOTAL', paid: 'Paid', balance: 'Balance' } as const)[block.key as 'subtotal' | 'discount' | 'total' | 'paid' | 'balance'] : value,
      ...(paired ? { right: value } : {}),
      align: block.align ?? 'left',
      bold: block.bold ?? block.key === 'total',
      large: block.large ?? false,
    });
  }
  return rows;
}

export function moveReceiptBlock(blocks: readonly ReceiptBlock[], index: number, delta: -1 | 1): ReceiptBlock[] {
  const target = index + delta;
  if (index < 0 || target < 0 || index >= blocks.length || target >= blocks.length) return [...blocks];
  const next = [...blocks];
  const current = next[index];
  const other = next[target];
  if (!current || !other) return next;
  next[index] = other;
  next[target] = current;
  return next;
}
