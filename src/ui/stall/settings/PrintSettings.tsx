// Receipt identity, template builder and direct printer setup.
import { useMemo, useState } from 'react';
import {
  PRINT_VARIABLES, DEFAULT_RECEIPT_TEMPLATE, buildReceiptRows, moveReceiptBlock, parseReceiptTemplate,
  canBluetoothPrint, canUsbPrint, selectBluetoothPrinter, selectUsbPrinter, selectedPrinter,
  printToSelectedPrinter, testPrintBytes, type PrinterChoice, type ReceiptBlock, type ReceiptTemplate,
} from '../../../store';
import { useApp } from '../../../store';
import { Sheet } from '../../kit/Sheet';
import kit from '../../kit/kit.module.css';
import { Group, Opt } from './Opt';
import ps from './PrintSettings.module.css';

const DETAILS = [
  { key: 'address', label: 'Address', placeholder: 'Street, area, city' },
  { key: 'contact', label: 'Contact number', placeholder: 'Phone number' },
  { key: 'slogan', label: 'Slogan', placeholder: 'A short line below the business name' },
  { key: 'welcomeNote', label: 'Welcome note', placeholder: 'Welcome! Thanks for visiting.' },
  { key: 'thankYouNote', label: 'Thank-you note', placeholder: 'Thank you. Visit again!' },
] as const;

const labelFor = (block: ReceiptBlock): string => {
  if (block.type === 'variable') return PRINT_VARIABLES.find(([key]) => key === block.key)?.[1] ?? block.key;
  if (block.type === 'text') return block.text || 'Custom text';
  if (block.type === 'items') return 'Order items';
  if (block.type === 'image') return 'Logo / image';
  return 'Divider';
};
const sampleContext = {
  values: {
    businessName: 'Momo Bus', eventName: 'Winter Carnival', address: 'Main Ground, Darbhanga',
    contact: '+91 98765 43210', slogan: 'Fresh. Hot. Made with care.',
    welcomeNote: 'Welcome!', token: '#024', dateTime: '21 Nov 2026 · 7:45 pm',
    customerName: 'Walk-in customer', orderNote: 'No onion',
    subtotal: '₹240.00', discount: '₹20.00', total: '₹220.00',
    paymentMode: 'Paid by UPI', paid: '₹220.00', balance: '₹0.00',
    thankYouNote: 'Thank you. Visit again!',
  },
  items: [{ name: 'Veg Momos', quantity: 2, unit: 'plate', rate: '₹100.00', amount: '₹200.00' }, { name: 'Cold Coffee', quantity: 1, unit: 'glass', rate: '₹40.00', amount: '₹40.00' }],
};

function DetailSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const settings = a.folded.settings;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(DETAILS.map((d) => [d.key, settings[d.key] ?? ''])));
  return (
    <Sheet title="Receipt details" onClose={onClose}>
      {DETAILS.map((d) => (
        <label className={kit.field} key={d.key}>
          <span className={kit.fieldLab}>{d.label}</span>
          <textarea className={[kit.input, kit.textarea].join(' ')} rows={2} value={values[d.key] ?? ''} placeholder={d.placeholder}
            onChange={(e) => { setValues((p) => ({ ...p, [d.key]: e.target.value })); }} />
        </label>
      ))}
      <div className={kit.row}>
        <span className={kit.grow} />
        <button type="button" className={kit.cta} onClick={() => {
          for (const d of DETAILS) a.catalog.setSetting(d.key, values[d.key] ?? '');
          onClose();
        }}>Save details</button>
      </div>
    </Sheet>
  );
}

function makeImageBlock(file: File, paperWidth: 58 | 80): Promise<ReceiptBlock> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Choose an image file')); return; }
    if (file.size > 4 * 1024 * 1024) { reject(new Error('Choose an image smaller than 4 MB')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That image could not be opened'));
      image.onload = () => {
        const maxWidth = paperWidth === 58 ? 384 : 576;
        const scale = Math.min(1, maxWidth / image.naturalWidth, 240 / image.naturalHeight);
        const width = Math.max(8, Math.floor((image.naturalWidth * scale) / 8) * 8);
        const height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('Image conversion is unavailable')); return; }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        try {
          resolve({ id: crypto.randomUUID(), type: 'image', dataUrl: canvas.toDataURL('image/png'), widthDots: width });
        } catch { reject(new Error('Could not prepare that image')); }
      };
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

function TemplateSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const stored = a.folded.settings.printTemplate;
  const [template, setTemplate] = useState<ReceiptTemplate>(() => parseReceiptTemplate(stored));
  const [variable, setVariable] = useState<string>('token');
  const [error, setError] = useState('');
  const rows = useMemo(() => buildReceiptRows(template, sampleContext), [template]);
  const update = (blocks: readonly ReceiptBlock[]) => setTemplate((p) => ({ ...p, blocks }));
  const addVariable = () => {
    if (!PRINT_VARIABLES.some(([key]) => key === variable)) return;
    update([...template.blocks, { id: crypto.randomUUID(), type: 'variable', key: variable as (typeof PRINT_VARIABLES)[number][0] }]);
  };
  const addText = () => update([...template.blocks, { id: crypto.randomUUID(), type: 'text', text: 'Your custom message', align: 'center' }]);
  const addDivider = () => update([...template.blocks, { id: crypto.randomUUID(), type: 'divider' }]);
  const addItems = () => {
    if (template.blocks.some((b) => b.type === 'items')) { setError('The item list is already in the template'); return; }
    update([...template.blocks, { id: crypto.randomUUID(), type: 'items' }]);
  };
  const addImage = async (file: File | undefined) => {
    if (!file) return;
    try { const image = await makeImageBlock(file, template.paperWidth); update([...template.blocks, image]); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Image could not be added'); }
  };
  return (
    <Sheet title="Receipt template maker" onClose={onClose}>
      <p className={kit.hint}>Build the printout by adding variables, custom text, item lists, dividers and your own logo. The same template drives thermal and system printing.</p>
      <label className={kit.field}>
        <span className={kit.fieldLab}>Paper width</span>
        <select className={kit.input} value={String(template.paperWidth)} onChange={(e) => setTemplate((p) => ({ ...p, paperWidth: e.target.value === '80' ? 80 : 58 }))}>
          <option value="58">58 mm</option><option value="80">80 mm</option>
        </select>
      </label>
      <div className={kit.field}>
        <span className={kit.fieldLab}>Add a variable</span>
        <div className={kit.row}>
          <select className={kit.input} value={variable} onChange={(e) => setVariable(e.target.value)}>
            {PRINT_VARIABLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button type="button" className={kit.quiet} onClick={addVariable}>Add</button>
        </div>
      </div>
      <div className={kit.row}>
        <button type="button" className={kit.quiet} onClick={addItems}>Add items</button>
        <button type="button" className={kit.quiet} onClick={addText}>Add text</button>
        <button type="button" className={kit.quiet} onClick={addDivider}>Add divider</button>
      </div>
      <label className={kit.field}>
        <span className={kit.fieldLab}>Add logo / image (PNG or JPEG)</span>
        <input className={kit.input} type="file" accept="image/*" onChange={(e) => { void addImage(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      </label>
      <div className={kit.field}>
        <span className={kit.fieldLab}>Template order · move blocks to arrange</span>
        {template.blocks.map((block, index) => (
          <div key={block.id} className={kit.row}>
            <span className={kit.grow}>{labelFor(block)}</span>
            <button type="button" className={kit.quiet} aria-label={`Move ${labelFor(block)} up`} disabled={index === 0}
              onClick={() => update(moveReceiptBlock(template.blocks, index, -1))}>↑</button>
            <button type="button" className={kit.quiet} aria-label={`Move ${labelFor(block)} down`} disabled={index === template.blocks.length - 1}
              onClick={() => update(moveReceiptBlock(template.blocks, index, 1))}>↓</button>
            <button type="button" className={kit.danger} aria-label={`Remove ${labelFor(block)}`}
              onClick={() => update(template.blocks.filter((x) => x.id !== block.id))}>×</button>
          </div>
        ))}
      </div>
      <div className={kit.field}>
        <span className={kit.fieldLab}>Live preview</span>
        <div style={{ background: '#fff', color: '#111', padding: '1rem', maxHeight: '20rem', overflow: 'auto', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {rows.map((row, i) => row.type === 'divider'
            ? <div key={i}>--------------------------------</div>
            : row.type === 'image'
              ? <img key={i} src={row.dataUrl} alt="Receipt logo preview" style={{ display: 'block', maxWidth: '100%', maxHeight: '5rem', objectFit: 'contain', margin: '0.25rem auto' }} />
              : <div key={i} style={{ display: 'flex', justifyContent: row.align === 'center' ? 'center' : row.align === 'right' ? 'flex-end' : 'space-between', fontWeight: row.bold ? 700 : 400, fontSize: row.large ? '1.2rem' : 'inherit', whiteSpace: 'pre-wrap' }}><span>{row.left}</span>{row.right ? <span>{row.right}</span> : null}</div>)}
        </div>
      </div>
      {error ? <p className={kit.err} role="alert">{error}</p> : null}
      <div className={kit.row}>
        <button type="button" className={kit.quiet} onClick={() => setTemplate(DEFAULT_RECEIPT_TEMPLATE)}>Restore default</button>
        <span className={kit.grow} />
        <button type="button" className={kit.cta} onClick={() => { a.catalog.setSetting('printTemplate', JSON.stringify(template)); a.money.toast('Receipt template saved'); onClose(); }}>Save template</button>
      </div>
    </Sheet>
  );
}


function SystemPrintTestSheet({ onClose }: { onClose: () => void }) {
  const settings = useApp((x) => x.folded.settings);
  return (
    <Sheet title="System print test" onClose={onClose}>
      <div className={ps.paper}>
        <h2>{settings.stallName || 'POS PRINT TEST'}</h2>
        {settings.eventName ? <p>{settings.eventName}</p> : null}
        {settings.address ? <p>{settings.address}</p> : null}
        {settings.contact ? <p>{settings.contact}</p> : null}
        <div className={ps.paperRule} />
        <p>TEST RECEIPT · #0001</p>
        <div className={ps.paperRule} />
        <div className={ps.paperTotal}><span>Print check</span><span>₹1.00</span></div>
        <div className={ps.paperRule} />
        <p>Printer dialogue and page layout check</p>
        <p>No real order or customer information</p>
      </div>
      <button type="button" className={ps.printBtn} onClick={() => { window.print(); }}>Open system print / AirPrint</button>
    </Sheet>
  );
}

function PrinterSettings() {
  const a = useApp((x) => x);
  const [printer, setPrinter] = useState<PrinterChoice | null>(() => selectedPrinter());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [systemTest, setSystemTest] = useState(false);
  const selectBle = async () => {
    setBusy(true); setError('');
    try { setPrinter(await selectBluetoothPrinter()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Bluetooth printer could not be selected'); }
    finally { setBusy(false); }
  };
  const selectUsb = async () => {
    setBusy(true); setError('');
    try { setPrinter(await selectUsbPrinter()); }
    catch (e) { setError(e instanceof Error ? e.message : 'USB printer could not be selected'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    if (!printer) return;
    setBusy(true); setError('');
    try { await printToSelectedPrinter(testPrintBytes(), printer.kind); a.money.toast('Test sent to printer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Printer test failed'); setPrinter(null); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Opt t="Selected printer" sub={printer ? `${printer.kind === 'usb' ? 'USB' : 'Bluetooth LE'} · ${printer.name}` : 'No direct printer selected on this device'}
        value={printer ? 'Connected' : 'Not selected'} />
      <div className={kit.row}>
        <button type="button" className={kit.quiet} disabled={!canBluetoothPrint() || busy} onClick={() => { void selectBle(); }}>Select Bluetooth LE</button>
        <button type="button" className={kit.quiet} disabled={!canUsbPrint() || busy} onClick={() => { void selectUsb(); }}>Select USB</button>
      </div>
      <div className={kit.row}>
        <button type="button" className={kit.cta} disabled={!printer || busy} onClick={() => { void test(); }}>{busy ? 'Working…' : 'Test direct printer'}</button>
        <button type="button" className={kit.quiet} onClick={() => setSystemTest(true)}>Test AirPrint / system print</button>
        <span className={kit.grow} />
      </div>
      {!canBluetoothPrint() || !canUsbPrint() ? <p className={kit.hint}>This browser does not expose every direct printer connection. On iPad, use the system Print sheet with an AirPrint-compatible printer.</p> : null}
      <p className={kit.hint}>Bluetooth here means BLE/GATT. Many low-cost thermal printers use Bluetooth Classic (SPP), which browser Bluetooth cannot access. USB requires a USB Printer Class device and a browser with WebUSB.</p>
      {error ? <p className={kit.err} role="alert">{error}</p> : null}
      {systemTest ? <SystemPrintTestSheet onClose={() => setSystemTest(false)} /> : null}
    </>
  );
}

export function PrintSettings() {
  const a = useApp((x) => x);
  const [details, setDetails] = useState(false);
  const [template, setTemplate] = useState(false);
  const settings = a.folded.settings;
  const parsed = parseReceiptTemplate(settings.printTemplate);
  return (
    <>
      <Group label="Receipt & printer">
        <Opt t="Receipt details" sub="Address, contact, slogan, welcome and thank-you notes" value="Edit" onClick={() => setDetails(true)} />
        <Opt t="Receipt template maker" sub={`${String(parsed.blocks.length)} blocks · ${String(parsed.paperWidth)} mm paper`} value="Edit" onClick={() => setTemplate(true)} />
        <PrinterSettings />
      </Group>
      {details ? <DetailSheet onClose={() => setDetails(false)} /> : null}
      {template ? <TemplateSheet onClose={() => setTemplate(false)} /> : null}
    </>
  );
}
