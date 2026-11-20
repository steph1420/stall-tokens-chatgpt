// F-70 Data backup, snapshots, and reset actions (06 rule 1: store coordinates data layer; UI emits intents).
import { CONFIG } from '../config';
import {
  backupFilename,
  createBackupData,
  createMemorySnapshotsStore,
  createMemoryStorageInfo,
  parseBackupJson,
  resetBrowserData,
  triggerFileDownload,
  type SnapshotSummary,
  type SnapshotsStore,
  type StorageEstimate,
  type StorageInfoStore,
} from '../data';
import type { Core, Log } from './core';

export interface BackupActions {
  exportData(): { filename: string; json: string };
  downloadBackup(): string;
  importBackup(jsonText: string): Promise<{ ok: boolean; error?: string; count?: number }>;
  createSnapshot(reason: string): Promise<string>;
  listSnapshots(): Promise<readonly SnapshotSummary[]>;
  restoreSnapshot(id: string): Promise<{ ok: boolean; error?: string }>;
  deleteSnapshot(id: string): Promise<void>;
  resetAll(deleteSnapshots?: boolean): Promise<void>;
  getStorageEstimate(): Promise<StorageEstimate>;
  persistStorage(): Promise<boolean>;
}

function resolveSnapshots(core: Core, custom?: SnapshotsStore): SnapshotsStore {
  if (custom) return custom;
  if (core.env.ds.snapshots) return core.env.ds.snapshots;
  return createMemorySnapshotsStore();
}

function resolveStorage(core: Core): StorageInfoStore {
  return core.env.ds.storageInfo ?? createMemoryStorageInfo();
}

function applyImportedPrefs(core: Core, rawPrefs: Record<string, unknown>): void {
  const allowed = { ...rawPrefs };
  delete allowed.deviceId;
  delete allowed.syncUrl;
  delete allowed.syncKey;
  delete allowed.passcode;
  delete allowed.passcodeOff;
  core.set((s) => ({ prefs: { ...s.prefs, ...allowed } }));
  core.env.ds.device.write(core.get().prefs);
}

function importBackupData(core: Core, log: Log, jsonText: string): { ok: boolean; error?: string; count?: number } {
  const res = parseBackupJson(jsonText);
  if (!res.ok) return { ok: false, error: res.error };
  const { ops, prefs } = res.data;
  if (ops.length > 0) log.intake(ops, true);
  if (prefs) applyImportedPrefs(core, prefs);
  return { ok: true, count: ops.length };
}

async function recordSnapshot(core: Core, log: Log, store: SnapshotsStore, reason: string): Promise<string> {
  const ops = log.all();
  const { syncKey, syncUrl, passcode, ...safePrefs } = core.get().prefs;
  const id = await store.save(reason, ops, safePrefs);
  const lastOp = ops[ops.length - 1];
  try {
    log.dispatch('snapshot.note', {
      snapshotId: id,
      at: Date.now(),
      reason: reason.slice(0, CONFIG.limits.noteMaxChars),
      opCount: ops.length,
      hash: lastOp ? lastOp.opId : 'empty',
    });
  } catch (err) {
    console.warn('snapshot.note dispatch skipped:', err);
  }
  return id;
}

async function performReset(core: Core, log: Log, store: SnapshotsStore, deleteSnapshots: boolean): Promise<void> {
  try {
    const { syncKey, syncUrl, passcode, ...safePrefs } = core.get().prefs;
    await store.save('Safety snapshot before reset', log.all(), safePrefs);
  } catch (err) {
    console.warn('Safety snapshot failed:', err);
  }
  await resetBrowserData(deleteSnapshots);
  log.load([]);
}

export function backupActions(core: Core, log: Log, customSnapshots?: SnapshotsStore): BackupActions {
  const snapshots = resolveSnapshots(core, customSnapshots);
  const storage = resolveStorage(core);

  return {
    exportData() {
      const ops = log.all();
      const { syncKey, syncUrl, passcode, ...safePrefs } = core.get().prefs;
      const data = createBackupData(ops, safePrefs.deviceId, safePrefs);
      return { filename: backupFilename(safePrefs.deviceId), json: JSON.stringify(data, null, 2) };
    },
    downloadBackup() {
      const { filename, json } = this.exportData();
      triggerFileDownload(filename, json);
      return filename;
    },
    importBackup(jsonText: string) { return Promise.resolve(importBackupData(core, log, jsonText)); },
    createSnapshot(reason: string) { return recordSnapshot(core, log, snapshots, reason); },
    listSnapshots() { return snapshots.list(); },
    async restoreSnapshot(id: string) {
      const snap = await snapshots.load(id);
      if (!snap) return { ok: false, error: 'Snapshot not found.' };
      if (snap.ops.length > 0) log.intake(snap.ops, true);
      return { ok: true };
    },
    deleteSnapshot(id: string) { return snapshots.delete(id); },
    resetAll(deleteSnapshots = true) { return performReset(core, log, snapshots, deleteSnapshots); },
    getStorageEstimate() { return storage.estimate(); },
    persistStorage() { return storage.persist(); },
  };
}
