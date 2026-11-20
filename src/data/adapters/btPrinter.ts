// F-41 Web Bluetooth thermal printer (Chrome on Android; Steve 16 Nov 19:31 IST). Picks a printer once per session,
// finds a writable characteristic on the usual ESC/POS services and writes the slip in small chunks. Where Web
// Bluetooth is missing (iPhone Safari, Firefox) the app falls back to window.print at 58 mm.
interface Char { readonly properties: { readonly write: boolean; readonly writeWithoutResponse: boolean }; writeValueWithoutResponse?: (b: BufferSource) => Promise<void>; writeValue: (b: BufferSource) => Promise<void> }
interface Svc { getCharacteristics: () => Promise<Char[]> }
interface Gatt { readonly connected: boolean; connect: () => Promise<Gatt>; getPrimaryServices: () => Promise<Svc[]> }
interface BtDevice { readonly gatt?: Gatt }
interface Bt { requestDevice: (o: object) => Promise<BtDevice> }

/** Common ESC/POS BLE services (generic printers, Xprinter / MTP / Goojprt). */
const SERVICES = [0x18f0, 0xff00, 0xffe0, 0xfee7, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455'];
const CHUNK = 100;
let cached: Char | null = null;

const bt = (): Bt | null => (typeof navigator !== 'undefined' && 'bluetooth' in navigator ? (navigator as unknown as { bluetooth: Bt }).bluetooth : null);
export const canBluetoothPrint = (): boolean => bt() !== null;

async function findChar(dev: BtDevice): Promise<Char> {
  if (!dev.gatt) throw new Error('This printer has no Bluetooth LE connection');
  const g = await dev.gatt.connect();
  for (const svc of await g.getPrimaryServices()) {
    const c = (await svc.getCharacteristics()).find((x) => x.properties.writeWithoutResponse || x.properties.write);
    if (c) return c;
  }
  throw new Error('No print channel found on this printer');
}

/** Sends bytes to the printer, asking to pick one the first time. Rejects with a short reason. */
export async function bluetoothPrint(bytes: Uint8Array): Promise<void> {
  const b = bt();
  if (!b) throw new Error('Bluetooth printing is not available in this browser');
  cached ??= await findChar(await b.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES }));
  const c = cached;
  try {
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = bytes.slice(i, i + CHUNK);
      if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) await c.writeValueWithoutResponse(part);
      else await c.writeValue(part);
    }
  } catch (e) { cached = null; throw e; }
}
