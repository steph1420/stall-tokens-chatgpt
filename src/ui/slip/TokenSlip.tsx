// Receipt preview and print orchestration. The same editable template feeds ESC/POS and system printing.
import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatInr, type Order, type Paise } from '../../contract';
import {
  bill, formatToken, istClock, useApp, parseReceiptTemplate, buildReceiptRows,
  selectedPrinter, printToSelectedPrinter, escposReceipt, rgbaToMonochrome,
  type ReceiptRow, type PrintableRow, type RasterRow,
} from '../../store';
import s from './TokenSlip.module.css';

function useReceipt(o: Order, draftTip?: Paise, draftWaived?: Paise) {
  const settings = useApp((x) => x.folded.settings);
  const items = useApp((x) => x.folded.items);
  const template = parseReceiptTemplate(settings.printTemplate);
  const cash = o.payments.reduce((t, p) => t + p.cash, 0);
  const upi = o.payments.reduce((t, p) => t + p.upi, 0);
  const paid = bill.paid(o);
  const tip = draftTip !== undefined ? draftTip : bill.tips(o);
  const waived = draftWaived !== undefined ? draftWaived : bill.waived(o);
  const subtotal = bill.subtotal(o);
  const discount = bill.discountAmount(subtotal, o.discount);
  const amountTotal = Math.max(0, bill.total(o) + tip - waived);
  const method = cash && upi ? 'Cash + UPI' : upi ? 'UPI' : cash ? 'Cash' : 'Not paid';
  const context = {
    values: {
      businessName: settings.stallName || 'Fair stall',
      eventName: settings.eventName ?? '',
      address: settings.address ?? '',
      contact: settings.contact ?? '',
      slogan: settings.slogan ?? '',
      welcomeNote: settings.welcomeNote ?? '',
      token: 'Token ' + formatToken(o.token, CONFIG.tokens.pad),
      dateTime: istClock(o.payments[0]?.at ?? o.createdAt),
      customerName: o.client,
      orderNote: o.note,
      subtotal: formatInr(subtotal),
      discount: discount > 0 ? '−' + formatInr(discount) : '',
      total: formatInr(amountTotal),
      paymentMode: method,
      paid: formatInr(paid),
      balance: formatInr(Math.max(0, bill.due(o) - tip + waived)),
      thankYouNote: settings.thankYouNote ?? '',
    },
    items: o.lines.filter((l) => l.qty > 0).map((l) => ({
      name: l.name,
      quantity: l.qty,
      unit: items[l.itemId]?.unit ?? '',
      rate: formatInr(l.price),
      amount: formatInr(l.price * l.qty),
      note: l.note,
    })),
  };
  const rows = buildReceiptRows(template, context);
  return { template, rows, context };
}

async function imageToRaster(row: Extract<ReceiptRow, { type: 'image' }>): Promise<RasterRow> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('A receipt image could not be decoded'));
    image.src = row.dataUrl;
  });
  const scale = Math.min(1, row.widthDots / image.naturalWidth, 256 / image.naturalHeight);
  const width = Math.max(8, Math.floor((image.naturalWidth * scale) / 8) * 8);
  const height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image-to-printer conversion is unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return { type: 'raster', widthDots: width, height, data: rgbaToMonochrome(ctx.getImageData(0, 0, width, height).data, width, height) };
}

async function prepareRows(rows: readonly ReceiptRow[]): Promise<PrintableRow[]> {
  const result: PrintableRow[] = [];
  for (const row of rows) result.push(row.type === 'image' ? await imageToRaster(row) : row);
  return result;
}

function ReceiptBody({ rows, paperWidth }: { rows: readonly ReceiptRow[]; paperWidth: 58 | 80 }) {
  return (
    <div className={s.slip} aria-label="Receipt preview" style={{ width: paperWidth + 'mm' }}>
      {rows.map((row, index) => row.type === 'divider'
        ? <div className={s.rule} key={index}>-----------------------------------------------</div>
        : row.type === 'image'
          ? <img className={s.logo} key={index} src={row.dataUrl} alt="Receipt logo" />
          : (
            <div className={[s.receiptRow, row.align === 'center' ? s.center : row.align === 'right' ? s.right : ''].join(' ')} key={index}
              style={{ fontWeight: row.bold ? 700 : 400, fontSize: row.large ? '1.25em' : undefined }}>
              <span>{row.left}</span>{row.right ? <span>{row.right}</span> : null}
            </div>
          ))}
    </div>
  );
}

export function SlipBody({ o, tip, waived }: { o: Order; tip?: Paise | undefined; waived?: Paise | undefined }) {
  const receipt = useReceipt(o, tip, waived);
  return <ReceiptBody rows={receipt.rows} paperWidth={receipt.template.paperWidth} />;
}

/** Print is always user-initiated: this works with AirPrint/system destinations on iPad and browser print on desktop. */
export function TokenSlipPrint({ o, tip, waived, onDone }: { o: Order; tip?: Paise | undefined; waived?: Paise | undefined; onDone: () => void }) {
  const receipt = useReceipt(o, tip, waived);
  const printer = selectedPrinter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const after = () => onDone();
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, [onDone]);
  const systemPrint = () => window.print();
  const directPrint = async () => {
    if (!printer) return;
    setBusy(true);
    setMsg('Preparing receipt…');
    try {
      const prepared = await prepareRows(receipt.rows);
      const data = escposReceipt(prepared, receipt.template.paperWidth, false);
      setMsg('Sending to printer…');
      await printToSelectedPrinter(data, printer.kind);
      setMsg('Receipt sent to printer');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Printing failed. Check the selected printer.');
    } finally { setBusy(false); }
  };
  return (
    <div className={s.preview} role="dialog" aria-label="Print receipt">
      <ReceiptBody rows={receipt.rows} paperWidth={receipt.template.paperWidth} />
      {msg ? <p className={s.msg} role="status">{msg}</p> : null}
      <div className={s.btns}>
        <button type="button" className={s.close} onClick={systemPrint}>System print / AirPrint</button>
        {printer ? <button type="button" className={s.close} disabled={busy} onClick={() => { void directPrint(); }}>{busy ? 'Sending…' : 'Print to ' + printer.name}</button> : null}
        <button type="button" className={s.close} onClick={onDone}>Close</button>
      </div>
      {!printer ? <p className={s.msg}>No direct printer selected. Configure Bluetooth LE or USB under Settings, or use System print / AirPrint.</p> : null}
    </div>
  );
}
