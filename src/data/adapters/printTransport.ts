// Direct printer transports. No third-party print service is involved.
// Bluetooth is BLE/GATT only in web browsers; USB uses WebUSB bulk OUT endpoints.
interface BleChar {
  readonly properties: { readonly write: boolean; readonly writeWithoutResponse: boolean };
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue: (value: BufferSource) => Promise<void>;
}
interface BleService { getCharacteristics(): Promise<BleChar[]> }
interface BleGatt {
  readonly connected: boolean;
  connect(): Promise<BleGatt>;
  getPrimaryServices(): Promise<BleService[]>;
  disconnect?(): void;
}
interface BleDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BleGatt;
  addEventListener?(type: string, listener: () => void): void;
}
interface BleApi {
  requestDevice(options: object): Promise<BleDevice>;
  getDevices?(): Promise<BleDevice[]>;
}
interface UsbEndpoint { readonly endpointNumber: number; readonly direction: 'in' | 'out'; readonly type: 'bulk' | 'interrupt' | 'isochronous' }
interface UsbAlternate { readonly alternateSetting: number; readonly endpoints: UsbEndpoint[] }
interface UsbInterface { readonly interfaceNumber: number; readonly alternates: UsbAlternate[]; readonly claimed?: boolean }
interface UsbConfiguration { readonly configurationValue: number; readonly interfaces: UsbInterface[] }
interface UsbTransferResult { readonly status: 'ok' | 'stall' | 'babble'; readonly bytesWritten: number }
interface UsbDevice {
  readonly vendorId: number; readonly productId: number; readonly productName?: string; readonly manufacturerName?: string;
  readonly configuration: UsbConfiguration | null;
  open(): Promise<void>; close(): Promise<void>; selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>; selectAlternateInterface?(interfaceNumber: number, alternateSetting: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<UsbTransferResult>;
  addEventListener?(type: string, listener: () => void): void;
}
interface UsbApi { requestDevice(options: object): Promise<UsbDevice>; getDevices?(): Promise<UsbDevice[]> }

export interface PrinterChoice {
  readonly kind: 'bluetooth-le' | 'usb';
  readonly id: string;
  readonly name: string;
  readonly vendorId?: number;
  readonly productId?: number;
}
let bleDevice: BleDevice | null = null;
let bleChar: BleChar | null = null;
let usbDevice: UsbDevice | null = null;
let usbEndpoint: number | null = null;
let usbInterface: number | null = null;

const bleApi = (): BleApi | null => typeof navigator !== 'undefined' && 'bluetooth' in navigator
  ? (navigator as unknown as { bluetooth: BleApi }).bluetooth : null;
const usbApi = (): UsbApi | null => typeof navigator !== 'undefined' && 'usb' in navigator
  ? (navigator as unknown as { usb: UsbApi }).usb : null;
export const canBluetoothPrint = (): boolean => bleApi() !== null;
export const canUsbPrint = (): boolean => usbApi() !== null && (typeof isSecureContext === 'undefined' || isSecureContext);

async function writableCharacteristic(device: BleDevice): Promise<BleChar> {
  if (!device.gatt) throw new Error('This Bluetooth device does not expose a BLE print connection');
  const gatt = await device.gatt.connect();
  const services = await gatt.getPrimaryServices();
  // Prefer printer-like custom services over arbitrary writable characteristics (e.g. device control).
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const suitable = chars.find((x) => x.properties.writeWithoutResponse || x.properties.write);
    if (suitable) return suitable;
  }
  throw new Error('No writable BLE print characteristic was found. This printer may use Bluetooth Classic (SPP), which browser printing cannot access.');
}

export async function selectBluetoothPrinter(): Promise<PrinterChoice> {
  const api = bleApi();
  if (!api) throw new Error('This browser does not support Web Bluetooth. On iPad, use AirPrint or a supported native print bridge.');
  const device = await api.requestDevice({
    acceptAllDevices: true,
    optionalServices: [0x18f0, 0xff00, 0xffe0, 0xfee7, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455'],
  });
  const characteristic = await writableCharacteristic(device);
  bleDevice = device;
  bleChar = characteristic;
  device.addEventListener?.('gattserverdisconnected', () => { if (bleDevice?.id === device.id) { bleChar = null; } });
  return { kind: 'bluetooth-le', id: device.id, name: device.name || 'Bluetooth printer' };
}

export async function bluetoothPrint(bytes: Uint8Array): Promise<void> {
  if (!bleDevice || !bleChar) throw new Error('Select a BLE printer in Settings first');
  if (!bleDevice.gatt?.connected) bleChar = await writableCharacteristic(bleDevice);
  const characteristic = bleChar;
  const chunkSize = 100;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const part = bytes.slice(i, i + chunkSize);
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(part);
    } else {
      await characteristic.writeValue(part);
    }
  }
}

function usbLabel(device: UsbDevice): string {
  const vendor = device.manufacturerName?.trim();
  const product = device.productName?.trim();
  return [vendor, product].filter(Boolean).join(' ') || `USB printer ${device.vendorId.toString(16)}:${device.productId.toString(16)}`;
}

export async function selectUsbPrinter(): Promise<PrinterChoice> {
  const api = usbApi();
  if (!api || !canUsbPrint()) throw new Error('WebUSB is unavailable here. Use an AirPrint printer on iPad, or a browser that supports WebUSB.');
  const device = await api.requestDevice({ filters: [{ classCode: 7 }] });
  // The USB Printer Class filter is intentionally conservative; some vendor-specific printers need a native driver bridge.
  await openUsb(device);
  usbDevice = device;
  return { kind: 'usb', id: `${device.vendorId}:${device.productId}`, name: usbLabel(device), vendorId: device.vendorId, productId: device.productId };
}

async function openUsb(device: UsbDevice): Promise<void> {
  await device.open();
  if (!device.configuration) {
    const configurations = (device as unknown as { configurations?: { configurationValue: number }[] }).configurations;
    const first = configurations?.[0]?.configurationValue ?? 1;
    await device.selectConfiguration(first);
  }
  const interfaces = device.configuration?.interfaces ?? [];
  for (const intf of interfaces) {
    for (const alternate of intf.alternates) {
      const endpoint = alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
      if (!endpoint) continue;
      try {
        await device.claimInterface(intf.interfaceNumber);
        if (alternate.alternateSetting !== 0) await device.selectAlternateInterface?.(intf.interfaceNumber, alternate.alternateSetting);
        usbDevice = device;
        usbEndpoint = endpoint.endpointNumber;
        usbInterface = intf.interfaceNumber;
        return;
      } catch {
        // Try the next interface; printers sometimes expose a non-printing USB interface first.
      }
    }
  }
  await device.close().catch(() => undefined);
  throw new Error('USB device has no accessible bulk OUT print endpoint. It may require an operating-system driver.');
}

export async function usbPrint(bytes: Uint8Array): Promise<void> {
  if (!usbDevice || usbEndpoint === null) throw new Error('Select a USB printer in Settings first');
  const chunkSize = 4096;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const result = await usbDevice.transferOut(usbEndpoint, bytes.slice(i, i + chunkSize));
    if (result.status !== 'ok') throw new Error(`USB printer transfer failed: ${result.status}`);
  }
}

export async function printToSelectedPrinter(bytes: Uint8Array, kind: PrinterChoice['kind']): Promise<void> {
  if (kind === 'usb') return usbPrint(bytes);
  return bluetoothPrint(bytes);
}

export async function disconnectPrinter(): Promise<void> {
  if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect?.();
  bleDevice = null;
  bleChar = null;
  if (usbDevice) {
    if (usbInterface !== null) {
      // WebUSB does not require release to stop output, but cleanly release when supported.
      await (usbDevice as unknown as { releaseInterface?: (n: number) => Promise<void> }).releaseInterface?.(usbInterface).catch(() => undefined);
    }
    await usbDevice.close().catch(() => undefined);
  }
  usbDevice = null;
  usbEndpoint = null;
  usbInterface = null;
}

export function selectedPrinter(): PrinterChoice | null {
  if (bleDevice && bleChar) return { kind: 'bluetooth-le', id: bleDevice.id, name: bleDevice.name || 'Bluetooth printer' };
  if (usbDevice && usbEndpoint !== null) return { kind: 'usb', id: `${usbDevice.vendorId}:${usbDevice.productId}`, name: usbLabel(usbDevice), vendorId: usbDevice.vendorId, productId: usbDevice.productId };
  return null;
}

export function testPrintBytes(): Uint8Array {
  const text = (s: string) => Array.from(new TextEncoder().encode(s + '\n'));
  return Uint8Array.from([0x1b, 0x40, 0x1b, 0x61, 1, ...text('STALL TOKENS'), ...text('PRINTER TEST'), 0x1b, 0x61, 0, ...text('Connection and paper feed OK'), ...text('--------------------------------'), ...text('No customer/order data printed'), 0x0a, 0x0a]);
}
