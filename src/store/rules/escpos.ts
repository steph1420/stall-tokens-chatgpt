// F-41 ESC/POS bytes for the token slip (Steve 16 Nov 19:31 IST): 58 mm thermal printers, 32 columns of font A.
// Plain ASCII only (most cheap printers have no ₹ glyph, so amounts print as "Rs 120").
export interface SlipText { readonly stall: string; readonly token: string; readonly meta: string; readonly lines: readonly (readonly [string, string])[]; readonly total: string; readonly paid: string }

const COLS = 32;
const ESC = 0x1b; const GS = 0x1d;
const ascii = (s: string): string => s.replace(/₹\s?/g, 'Rs ').replace(/[×]/g, 'x').replace(/[·•]/g, '-').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?');
const pair = (l: string, r: string): string => { const right = ascii(r); const left = ascii(l).slice(0, Math.max(1, COLS - right.length - 1)); return left + ' '.repeat(Math.max(1, COLS - left.length - right.length)) + right; };

/** Builds the printer bytes: init, centred stall + big token, items, total, paid line, feed and cut. */
export function escposSlip(t: SlipText): Uint8Array {
  const out: number[] = [];
  const cmd = (...b: number[]) => { out.push(...b); };
  const text = (s: string) => { for (const ch of ascii(s)) out.push(ch.charCodeAt(0)); out.push(0x0a); };
  cmd(ESC, 0x40); cmd(ESC, 0x61, 1);
  cmd(ESC, 0x45, 1); text(t.stall); cmd(ESC, 0x45, 0);
  text('TOKEN');
  cmd(GS, 0x21, 0x33); text(t.token); cmd(GS, 0x21, 0x00);
  text(t.meta);
  cmd(ESC, 0x61, 0); text('-'.repeat(COLS));
  for (const [l, r] of t.lines) text(pair(l, r));
  text('-'.repeat(COLS));
  cmd(ESC, 0x45, 1); text(pair('Total', t.total)); cmd(ESC, 0x45, 0);
  cmd(ESC, 0x61, 1); text(t.paid); text('Show this at pickup');
  cmd(ESC, 0x64, 4); cmd(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(out);
}

import type { ReceiptRow } from './receiptTemplate';

export interface RasterRow { readonly type: 'raster'; readonly widthDots: number; readonly height: number; readonly data: Uint8Array }
export type PrintableRow = ReceiptRow | RasterRow;
const columnsFor = (paperWidth: 58 | 80): number => paperWidth === 80 ? 48 : 32;

const wrapWords = (source: string, columns: number): string[] => {
  const words = ascii(source).split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word.slice(0, columns);
    else if (line.length + 1 + word.length <= columns) line += ' ' + word;
    else { result.push(line); line = word.slice(0, columns); }
  }
  if (line) result.push(line);
  return result;
};

/** Converts RGBA pixels (from a canvas) into row-major, MSB-first, 1-bit ESC/POS raster data. */
export function rgbaToMonochrome(rgba: Uint8ClampedArray, width: number, height: number, threshold = 180): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length < width * height * 4) {
    throw new Error('Invalid logo pixel data');
  }
  const bytesPerRow = Math.ceil(width / 8);
  const packed = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = (rgba[offset + 3] ?? 255) / 255;
      const grey = ((rgba[offset] ?? 255) * 0.299 + (rgba[offset + 1] ?? 255) * 0.587 + (rgba[offset + 2] ?? 255) * 0.114) * alpha + 255 * (1 - alpha);
      if (grey < threshold) {
        const at = y * bytesPerRow + Math.floor(x / 8);
        packed[at] = (packed[at] ?? 0) | (0x80 >> (x % 8));
      }
    }
  }
  return packed;
}

/** ESC/POS GS v 0 raster image command. The data is packed MSB-first, one row at a time. */
export function escposRasterImage(width: number, height: number, data: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new Error('Invalid raster image dimensions');
  }
  const bytesPerRow = Math.ceil(width / 8);
  if (data.length !== bytesPerRow * height) throw new Error('Raster image byte count does not match its dimensions');
  const xL = bytesPerRow & 0xff; const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff; const yH = (height >> 8) & 0xff;
  return Uint8Array.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...data]);
}

/** Generic receipt encoder used by the template maker. No third-party print service, app-added text or forced cutter command. */
export function escposReceipt(rows: readonly PrintableRow[], paperWidth: 58 | 80 = 58, cutPaper = false): Uint8Array {
  const cols = columnsFor(paperWidth);
  const out: number[] = [0x1b, 0x40];
  const cmd = (...bytes: number[]) => { out.push(...bytes); };
  const write = (source: string) => { for (const ch of ascii(source)) out.push(ch.charCodeAt(0)); out.push(0x0a); };
  const writeText = (row: Extract<ReceiptRow, { type: 'text' }>) => {
    cmd(0x1b, 0x61, row.align === 'center' ? 1 : row.align === 'right' ? 2 : 0);
    cmd(0x1b, 0x45, row.bold ? 1 : 0);
    cmd(0x1d, 0x21, row.large ? 0x11 : 0x00);
    if (row.right) {
      const right = ascii(row.right).slice(0, cols - 2);
      const leftWidth = Math.max(1, cols - right.length - 1);
      const lines = wrapWords(row.left, leftWidth);
      for (const line of lines.length ? lines : ['']) write(line + ' '.repeat(Math.max(1, cols - line.length - right.length)) + right);
    } else {
      for (const line of wrapWords(row.left, cols)) write(line);
    }
    cmd(0x1d, 0x21, 0x00);
    cmd(0x1b, 0x45, 0);
    cmd(0x1b, 0x61, 0);
  };
  for (const row of rows) {
    if (row.type === 'raster') { out.push(...escposRasterImage(row.widthDots, row.height, row.data)); out.push(0x0a); continue; }
    if (row.type === 'image') continue; // Convert the template image to a RasterRow before encoding.
    if (row.type === 'divider') { write('-'.repeat(cols)); continue; }
    writeText(row);
  }
  cmd(0x1b, 0x64, 4);
  if (cutPaper) cmd(0x1d, 0x56, 0x42, 0x00);
  return Uint8Array.from(out);
}
