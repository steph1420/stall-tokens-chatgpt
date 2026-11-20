// F-67 Day notes (P-13, FEATURES §22): free text plus quick chips, per day, editable any day later. Opened from Close the
// day step 4 and the History day header ("Notes ›"). Saved as record.set day_note (every phone, the Sheet day_notes tab).
import { useState } from 'react';
import { CONFIG } from '../../config';
import { closing, useApp } from '../../store';
import { Sheet } from '../kit/Sheet';
import s from './Stall.module.css';

export function DayNotesSheet({ dayId, title, onClose }: { dayId: string; title: string; onClose: () => void }) {
  const rec = closing.closeRecord(useApp((x) => x.folded.records.day_note?.[dayId]));
  const c = useApp((x) => x.close);
  const toast = useApp((x) => x.money.toast);
  const [text, setText] = useState(rec.text);
  const [tags, setTags] = useState<readonly string[]>(rec.tags);
  const flip = (t: string) => { setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]); };
  const done = () => { c.setNotes(dayId, text, tags); toast('Notes saved'); onClose(); };
  return (
    <Sheet title={`Notes · ${title}`} onClose={onClose}>
      <div className={s.chips} role="group" aria-label="Quick notes">
        {CONFIG.close.noteTags.map((t) => (
          <button key={t} type="button" aria-pressed={tags.includes(t)} className={tags.includes(t) ? s.chipOn : s.chip} onClick={() => { flip(t); }}>{t}</button>
        ))}
      </div>
      <textarea className={s.noteBox} aria-label="Notes" rows={4} maxLength={CONFIG.limits.recordTextMax} placeholder="What happened today? (rain, a rush at 7, ran out of cups…)" value={text} onChange={(e) => { setText(e.target.value); }} />
      <button type="button" className={s.goBig} onClick={done}>Save notes</button>
    </Sheet>
  );
}
