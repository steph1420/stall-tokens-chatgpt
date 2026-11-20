// F-70 Data backup export/import (06 rule 1: data layer owns storage format; UI never touches File/Blob directly).
import { CONTRACT_VERSION, isValidOp, type Op } from '../../contract';
import { CONFIG } from '../../config';
import type { BackupFileContent, BackupMeta, DevicePrefs } from '../types';

/** Fast deterministic hash (FNV-1a 64-bit folded to 8 hex chars) for op log verification. */
export function computeOpLogHash(ops: readonly Op[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (const op of ops) {
    const s = `${op.opId}:${String(op.seq)}:${op.kind}:${String(op.wallAt)}`;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ (c >> 4), 0x01000193);
    }
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1.slice(0, 4)}${hex2.slice(0, 4)}`;
}

/** Returns the formatted filename: stall-tokens-backup-<IST date>-<short deviceId>.json */
export function backupFilename(deviceId: string, date: Date = new Date()): string {
  const istTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  const istDate = istTime.toISOString().slice(0, 10);
  const shortDev = deviceId.slice(0, 8);
  return `stall-tokens-backup-${istDate}-${shortDev}.json`;
}

/** Creates structured backup data from current ops and prefs. */
export function createBackupData(
  ops: readonly Op[],
  deviceId: string,
  prefs?: Partial<DevicePrefs>,
  date: Date = new Date(),
): BackupFileContent {
  const hash = computeOpLogHash(ops);
  const meta: BackupMeta = {
    contractVersion: CONTRACT_VERSION,
    appVersion: CONFIG.app.version,
    exportedAt: date.toISOString(),
    deviceId,
    opCount: ops.length,
    hash,
  };
  return { meta, ops, prefs };
}

export type ParseResult =
  | { readonly ok: true; readonly data: BackupFileContent }
  | { readonly ok: false; readonly error: string };

function parseMeta(raw: unknown): { ok: true; meta: BackupMeta } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Missing metadata header in backup.' };
  const r = raw as Record<string, unknown>;
  if (r.contractVersion !== CONTRACT_VERSION) {
    return { ok: false, error: `Unsupported contract version ${String(r.contractVersion)} (expected ${String(CONTRACT_VERSION)}).` };
  }
  return {
    ok: true,
    meta: {
      contractVersion: CONTRACT_VERSION,
      appVersion: typeof r.appVersion === 'string' ? r.appVersion : '',
      exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : new Date().toISOString(),
      deviceId: typeof r.deviceId === 'string' ? r.deviceId : '',
      opCount: typeof r.opCount === 'number' ? r.opCount : 0,
      hash: typeof r.hash === 'string' ? r.hash : '',
    },
  };
}

function parseOps(raw: unknown): { ok: true; ops: Op[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Missing or invalid ops array.' };
  const validOps: Op[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (!isValidOp(item)) return { ok: false, error: `Invalid op at index ${String(i)}.` };
    validOps.push(item);
  }
  return { ok: true, ops: validOps };
}

/** Safe parser and validator for backup JSON text. */
export function parseBackupJson(rawJson: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return { ok: false, error: `File is not valid JSON: ${String(e)}` };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'Backup root must be an object.' };

  const record = parsed as Record<string, unknown>;
  const metaRes = parseMeta(record.meta);
  if (!metaRes.ok) return metaRes;

  const opsRes = parseOps(record.ops);
  if (!opsRes.ok) return opsRes;

  const computedHash = computeOpLogHash(opsRes.ops);
  if (metaRes.meta.hash && computedHash !== metaRes.meta.hash) {
    return { ok: false, error: 'Checksum mismatch: backup content was modified or corrupted.' };
  }

  const prefs = typeof record.prefs === 'object' && record.prefs !== null ? (record.prefs as Partial<DevicePrefs>) : undefined;
  return {
    ok: true,
    data: { meta: { ...metaRes.meta, opCount: opsRes.ops.length, hash: computedHash }, ops: opsRes.ops, prefs },
  };
}

/** Browser trigger: downloads a text blob as a file. */
export function triggerFileDownload(filename: string, content: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
