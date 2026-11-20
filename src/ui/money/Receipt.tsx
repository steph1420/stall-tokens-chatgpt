// F-47 Receipt photos on a Money entry: the phone camera via <input capture>, shrunk to about 1280 px JPEG and kept on
// this phone (IndexedDB). 📷 adds one; 🧾 opens it full screen with Retake / Remove.
import { useEffect, useState } from 'react';
import { dropReceipt, getReceipt, putReceipt, receiptIds, useApp } from '../../store';
import s from './Money.module.css';

const MAX = 1280;
async function shrink(f: File): Promise<Blob> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => { c.toBlob((b) => { res(b ?? f); }, 'image/jpeg', 0.8); });
}

/** Which entries have a photo on this phone; `bump` re-reads after a change. */
export function useReceiptIds(): [ReadonlySet<string>, () => void] {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [n, setN] = useState(0);
  useEffect(() => { receiptIds().then((x) => { setIds(new Set(x)); }, () => { setIds(new Set()); }); }, [n]);
  return [ids, () => { setN((x) => x + 1); }];
}

function Viewer({ entryId, onClose, onChange }: { entryId: string; onClose: () => void; onChange: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let u = ''; void getReceipt(entryId).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } }); return () => { if (u) URL.revokeObjectURL(u); }; }, [entryId]);
  return (
    <div className={s.photoView} role="dialog" aria-label="Receipt photo">
      {url ? <img src={url} alt="Receipt" className={s.photoImg} /> : null}
      <div className={s.photoBar}>
        <button type="button" className={s.photoBtn} onClick={() => { void dropReceipt(entryId).then(() => { onChange(); onClose(); }); }}>Remove</button>
        <button type="button" className={s.photoBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function ReceiptButton({ entryId, has, onChange }: { entryId: string; has: boolean; onChange: () => void }) {
  const toast = useApp((x) => x.money.toast);
  const [view, setView] = useState(false);
  const take = (f: File | undefined) => { if (f) shrink(f).then((b) => putReceipt(entryId, b)).then(() => { onChange(); toast('Receipt saved on this phone'); }, () => { toast('Could not save the photo'); }); };
  if (has) {
    return <><button type="button" className={s.photoChip} aria-label="Open receipt photo" onClick={() => { setView(true); }}>🧾</button>
      {view ? <Viewer entryId={entryId} onChange={onChange} onClose={() => { setView(false); }} /> : null}</>;
  }
  return (
    <label className={s.photoChip} aria-label="Add receipt photo">📷
      <input type="file" accept="image/*" capture="environment" className={s.photoInput} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}
