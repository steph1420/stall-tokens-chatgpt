// F-45 Inline editor for a shared amount list (tip choices / round-off steps): used in Settings, the Payment tip row
// and the Billing round-off sheet, all writing the same synced setting.
import { useState } from 'react';
import { amounts, useApp } from '../../store';
import kit from './kit.module.css';

const LABEL: Readonly<Record<amounts.AmountsKey, string>> = { tipChips: 'Tip choices (₹)', roundOffSteps: 'Round-off steps (₹)' };

export function AmountsEdit({ k, onDone }: { k: amounts.AmountsKey; onDone: () => void }) {
  const a = useApp((x) => x);
  const cur = amounts.amounts(a.folded.settings, k);
  const [text, setText] = useState(amounts.rupeesText(cur));
  const [err, setErr] = useState('');
  const save = () => { const e = a.catalog.setAmounts(k, text); if (e) setErr(e); else onDone(); };
  return (
    <div className={kit.amountsEdit}>
      <label className={kit.fieldLab} htmlFor={`amt-${k}`}>{LABEL[k]}</label>
      <input id={`amt-${k}`} className={kit.input} inputMode="decimal" value={text} placeholder={k === 'roundOffSteps' ? '5, 10' : '10, 20'} onChange={(e) => { setText(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      <div className={kit.hint}>{err || 'Shared with every phone. Separate with commas.'}</div>
      <div className={kit.row}>
        <button type="button" className={kit.quiet} onClick={onDone}>Cancel</button>
        <span className={kit.grow} />
        <button type="button" className={kit.cta} onClick={save}>Save</button>
      </div>
    </div>
  );
}
