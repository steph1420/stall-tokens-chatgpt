// Data settings: Backup, Restore, Snapshots, Reset app, and Storage warning (F-70, Q-STORE-WARN).
import { useEffect, useRef, useState } from 'react';
import { useApp, type AppState, type SnapshotSummary, type StorageEstimate } from '../../../store';
import { HoldButton } from '../../kit/HoldButton';
import { Sheet } from '../../kit/Sheet';
import kit from '../../kit/kit.module.css';
import setStyles from './Settings.module.css';
import { Group, Opt } from './Opt';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SnapshotCard({ snap, onRestore, onDelete }: { snap: SnapshotSummary; onRestore: () => void; onDelete: () => void }) {
  return (
    <div className={setStyles.snapCard}>
      <div className={setStyles.snapH}>
        <span className={setStyles.snapTitle}>{snap.reason}</span>
        <span className={setStyles.snapMeta}>{formatBytes(snap.opCount * 128)}</span>
      </div>
      <span className={setStyles.snapMeta}>{`${String(snap.opCount)} ops · ${new Date(snap.createdAt).toLocaleTimeString()}`}</span>
      <div className={setStyles.snapActs}>
        <button type="button" className={kit.small} onClick={onRestore}>Restore</button>
        <button type="button" className={kit.btnDanger} style={{ minHeight: 'var(--dl-hit-min)', padding: '0 0.75rem', fontSize: '0.8125rem' }} onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function SnapshotList({
  list,
  onRestore,
  onDelete,
}: {
  list: readonly SnapshotSummary[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (list.length === 0) return <p className={setStyles.rowSub}>No snapshots saved yet.</p>;
  return (
    <div className={setStyles.snapList}>
      {list.map((snap) => (
        <SnapshotCard key={snap.id} snap={snap} onRestore={() => { onRestore(snap.id); }} onDelete={() => { onDelete(snap.id); }} />
      ))}
    </div>
  );
}

function SnapshotTakeBar({ reason, onChange, onTake }: { reason: string; onChange: (v: string) => void; onTake: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <input className={kit.input} placeholder="Snapshot reason" value={reason} onChange={(e) => { onChange(e.target.value); }} />
      <button type="button" className={kit.cta} onClick={onTake}>Take snapshot</button>
    </div>
  );
}

function SnapshotsSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const [list, setList] = useState<readonly SnapshotSummary[]>([]);
  const [reason, setReason] = useState('');

  const loadList = () => { void a.backup.listSnapshots().then(setList).catch(() => { setList([]); }); };
  useEffect(() => {
    void a.backup.listSnapshots().then(setList).catch(() => { setList([]); });
  }, [a.backup]);

  const handleTake = () => {
    void (async () => {
      await a.backup.createSnapshot(reason.trim() || 'Manual snapshot');
      setReason('');
      a.money.toast('Snapshot created');
      loadList();
    })();
  };

  const handleRestore = (id: string) => {
    void (async () => {
      const res = await a.backup.restoreSnapshot(id);
      if (!res.ok) { a.money.toast(res.error ?? 'Restore failed'); return; }
      a.money.toast('Snapshot restored');
      onClose();
    })();
  };

  const handleDelete = (id: string) => {
    void (async () => {
      await a.backup.deleteSnapshot(id);
      a.money.toast('Snapshot deleted');
      loadList();
    })();
  };

  return (
    <Sheet title="Safety Snapshots" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <SnapshotTakeBar reason={reason} onChange={setReason} onTake={handleTake} />
        <SnapshotList list={list} onRestore={handleRestore} onDelete={handleDelete} />
      </div>
    </Sheet>
  );
}

function ResetSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const pending = a.sync.pending;

  const handleReset = async () => {
    await a.backup.resetAll(true);
    a.money.toast('App reset complete');
    onClose();
  };

  return (
    <Sheet title="Reset Stall Tokens" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className={setStyles.dangerBox}>
          <strong>Warning: Destructive Action</strong>
          <p style={{ margin: '0.25rem 0 0' }}>This will erase all local orders, receipts, and cached data on this device.</p>
        </div>
        {pending > 0 ? (
          <div className={setStyles.warnBox}>
            {`⚠️ ${String(pending)} change(s) have not yet synced to the Sheet. Sync first if possible.`}
          </div>
        ) : null}
        <HoldButton label="Hold to reset app" className={kit.btnDanger} onConfirm={() => { void handleReset(); }} onHint={() => { a.money.toast('Hold down to confirm reset'); }}>
          Hold to reset app
        </HoldButton>
      </div>
    </Sheet>
  );
}

function processRestoreFile(file: File, a: AppState) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    void (async () => {
      await a.backup.createSnapshot('Safety snapshot before restore');
      const res = await a.backup.importBackup(text);
      if (!res.ok) { a.money.toast(res.error ?? 'Restore failed'); return; }
      a.money.toast(`Restored ${String(res.count ?? 0)} orders`);
    })();
  };
  reader.readAsText(file);
}

export function DataSettings() {
  const a = useApp((x) => x);
  const [snapSheet, setSnapSheet] = useState(false);
  const [resetSheet, setResetSheet] = useState(false);
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void a.backup.getStorageEstimate().then(setStorage).catch(() => { setStorage(null); }); }, [a.backup]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processRestoreFile(file, a);
    e.target.value = '';
  };

  const togglePersist = () => {
    void (async () => {
      if (await a.backup.persistStorage()) a.money.toast('Storage persistence enabled');
      setStorage(await a.backup.getStorageEstimate());
    })();
  };

  const storageSub = storage ? `${formatBytes(storage.usageBytes)} used · ${storage.persisted ? 'Persistent' : 'Standard'}` : 'Checking storage…';

  return (
    <Group label="Data">
      <Opt t="Back up now" sub="Export orders and device settings to a JSON file" onClick={() => { a.backup.downloadBackup(); a.money.toast('Backup downloaded'); }} />
      <Opt t="Restore from a file" sub="Import orders and settings from a backup JSON" onClick={() => { fileInputRef.current?.click(); }} />
      <Opt t="Snapshots" sub="Point-in-time safety rollbacks" value="Manage" onClick={() => { setSnapSheet(true); }} />
      <Opt t="Storage" sub={storageSub} value={storage?.persisted ? 'Safe' : 'Persist'} badge={storage?.warning ? <span className={setStyles.warnBadge}>Storage &gt; 80%</span> : null} onClick={togglePersist} />
      <Opt t="Reset app" sub="Erase local orders and settings on this phone" onClick={() => { setResetSheet(true); }} />
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onFileChange} />
      {snapSheet ? <SnapshotsSheet onClose={() => { setSnapSheet(false); }} /> : null}
      {resetSheet ? <ResetSheet onClose={() => { setResetSheet(false); }} /> : null}
    </Group>
  );
}
