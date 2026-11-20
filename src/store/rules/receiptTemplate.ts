// POS receipt templates: a small, portable document model shared by thermal and browser printing.
export const PRINT_VARIABLES = [
  ['businessName', 'Business / bus name'], ['eventName', 'Event name'], ['address', 'Address'],
  ['contact', 'Contact number'], ['slogan', 'Slogan'], ['welcomeNote', 'Welcome note'],
  ['token', 'Token number'], ['dateTime', 'Date and time'], ['servingName', 'Served by'], ['customerName', 'Customer name'],
  ['orderNote', 'Overall order note'], ['subtotal', 'Subtotal'], ['discount', 'Discount'], ['roundOff', 'Round-off'], ['tip', 'Tip'], ['waived', 'Waived amount'],
  ['total', 'Grand total'], ['paymentMode', 'Payment method'], ['paid', 'Amount paid'],
  ['balance', 'Balance due'], ['thankYouNote', 'Thank-you note'],
] as const;
export type PrintVariable = (typeof PRINT_VARIABLES)[number][0];
export type ReceiptBlock =
  | { readonly id: string; readonly type: 'variable'; readonly key: PrintVariable; readonly align?: 'left' | 'center' | 'right'; readonly bold?: boolean; readonly large?: boolean }
  | { readonly id: string; readonly type: 'text'; readonly text: string; readonly align?: 'left' | 'center' | 'right'; readonly bold?: boolean }
  | { readonly id: string; readonly type: 'divider' }
  | { readonly id: string; readonly type: 'items'; readonly showQty?: boolean; readonly showUnit?: boolean; readonly showRate?: boolean; readonly showAmount?: boolean; readonly showItemNote?: boolean }
  | { readonly id: string; readonly type: 'image'; readonly dataUrl: string; readonly widthDots: number };
export interface ReceiptTemplate { readonly version: 1; readonly paperWidth: 58 | 80; readonly cutPaper?: boolean; readonly feedLines?: number; readonly blocks: readonly ReceiptBlock[] }
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
  cutPaper: false,
  feedLines: 4,
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
    variable('b-serving', 'servingName'),
    variable('b-customer', 'customerName'),
    { id: 'b-items', type: 'items', showQty: true, showUnit: true, showRate: true, showAmount: true, showItemNote: true },
    variable('b-order-note', 'orderNote'),
    { id: 'b-rule-2', type: 'divider' },
    variable('b-subtotal', 'subtotal'),
    variable('b-discount', 'discount'),
    variable('b-roundoff', 'roundOff'),
    variable('b-tip', 'tip'),
    variable('b-waived', 'waived'),
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
    if (x.version !== 1 || (x.paperWidth !== 58 && x.paperWidth !== 80) || !Array.isArray(x.blocks) || (x.feedLines !== undefined && (!Number.isInteger(x.feedLines) || x.feedLines < 0 || x.feedLines > 10)) || (x.cutPaper !== undefined && typeof x.cutPaper !== 'boolean')) return DEFAULT_RECEIPT_TEMPLATE;
    const allowed = new Set<string>(PRINT_VARIABLES.map(([key]) => key));
    const blocks = x.blocks.filter((b): b is ReceiptBlock => {
      if (typeof b !== 'object' || b === null || typeof b.id !== 'string' || typeof b.type !== 'string') return false;
      const alignOk = b.align === undefined || b.align === 'left' || b.align === 'center' || b.align === 'right';
      const boolsOk = (b.bold === undefined || typeof b.bold === 'boolean') && (b.large === undefined || typeof b.large === 'boolean');
      if (b.type === 'divider') return true;
      if (b.type === 'items') return ['showQty', 'showUnit', 'showRate', 'showAmount', 'showItemNote'].every((k) =>
        (b as Record<string, unknown>)[k] === undefined || typeof (b as Record<string, unknown>)[k] === 'boolean');
      if (b.type === 'text') return typeof b.text === 'string' && alignOk && boolsOk;
      if (b.type === 'image') return typeof b.dataUrl === 'string' && b.dataUrl.startsWith('data:image/') && b.dataUrl.length <= 40_000 && Number.isInteger(b.widthDots) && b.widthDots > 0 && b.widthDots <= 576;
      return b.type === 'variable' && typeof b.key === 'string' && allowed.has(b.key) && alignOk && boolsOk;
    });
    return { version: 1, paperWidth: x.paperWidth, cutPaper: x.cutPaper ?? false, feedLines: x.feedLines ?? 4, blocks };
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
        const unit = block.showUnit === false || !item.unit ? '' : ` ${item.unit}`;
        const qty = block.showQty === false ? '' : `${item.quantity} × `;
        const showAmount = block.showAmount !== false;
        rows.push({
          type: 'text',
          left: `${qty}${item.name}${unit}`,
          ...(showAmount ? { right: item.amount } : {}),
          align: 'left', bold: false, large: false,
        });
        if (block.showRate !== false) rows.push({ type: 'text', left: `  @ ${item.rate}`, align: 'left', bold: false, large: false });
        if (block.showItemNote !== false && item.note) rows.push({ type: 'text', left: `  Note: ${item.note}`, align: 'left', bold: false, large: false });
      }
      continue;
    }
    if (block.type === 'text') {
      if (block.text.trim()) rows.push({ type: 'text', left: block.text, align: block.align ?? 'left', bold: block.bold ?? false, large: false });
      continue;
    }
    const value = context.values[block.key] ?? '';
    if (!value.trim()) continue;
    const label: Partial<Record<PrintVariable, string>> = {
      subtotal: 'Subtotal', discount: 'Discount', roundOff: 'Round-off', tip: 'Tip', waived: 'Waived',
      total: 'TOTAL', paid: 'Paid', balance: 'Balance',
    };
    const pairLabel = label[block.key];
    rows.push({
      type: 'text',
      left: pairLabel ?? value,
      ...(pairLabel ? { right: value } : {}),
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
