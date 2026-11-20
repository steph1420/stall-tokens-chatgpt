// F-44 Developer > Sign-in links (Steve 16 Nov 19:33 IST): one-tap links per person / role. The link carries the
// Sheet bridge URL, stall key, role and name in the #fragment; opening it sets the phone up and opens that screen.
// Revoke all links by changing STALL_KEY on the script. No pairing, no passcode (D-ACCESS off by default).
import { useState } from 'react';
import { isSheetUrl, joinUrl, useApp } from '../../store';
import kit from '../kit/kit.module.css';
import { StallPage } from './StallPage';
import s from './Stall.module.css';

function useRoles(): { id: string; label: string }[] {
  const stations = useApp((x) => [...new Set(Object.values(x.folded.items).filter((i) => !i.removed && !i.supply && i.stationId).map((i) => i.stationId))]);
  return [{ id: 'counter', label: 'Counter' }, { id: 'kitchen', label: 'Kitchen' }, ...stations.map((id) => ({ id: `station:${id}`, label: `Station · ${id}` })), { id: 'launch', label: 'Start screen (all)' }];
}

function LinkOut({ link, onCopy }: { link: string; onCopy: () => void }) {
  const share = () => { void navigator.share({ title: 'Stall Tokens sign-in', url: link }).catch(() => { onCopy(); }); };
  return (
    <div className={s.syncForm}>
      <textarea className={kit.input} aria-label="Sign-in link" readOnly rows={3} value={link} />
      <div className={s.two2}>
        <button type="button" className={kit.cta} onClick={onCopy}>Copy link</button>
        {typeof navigator.share === 'function' ? <button type="button" className={kit.cta} onClick={share}>Share…</button> : null}
      </div>
    </div>
  );
}

export function DeveloperScreen() {
  const a = useApp((x) => x);
  const roles = useRoles();
  const [url, setUrl] = useState(a.prefs.syncUrl);
  const [key, setKey] = useState(a.prefs.syncKey);
  const [role, setRole] = useState('counter');
  const [name, setName] = useState('');
  const [link, setLinkRaw] = useState('');
  const [note, setNote] = useState('');
  const setLink = (l: string) => { setLinkRaw(l); setNote(''); };
  const ok = isSheetUrl(url) && key.trim() !== '';
  const make = () => { setLink(joinUrl(window.location.href, { url: url.trim(), key: key.trim(), role, name: name.trim() })); };
  const copy = () => { void navigator.clipboard.writeText(link).then(() => { setNote('Link copied'); }, () => { setNote('Select the link and copy it'); }); };
  return (
    <StallPage title="Sign-in links">
      <p className={s.syncHint}>Make one link per person. Opening it on their phone sets up sync and opens their screen, no typing. Anyone with a link can sync with the Sheet: to cut every link off, change STALL_KEY on the script and make new ones.</p>
      <div className={s.syncForm}>
        <input className={kit.input} aria-label="Web-app link" placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" value={url} onChange={(e) => { setUrl(e.target.value); setLink(''); }} />
        <input className={kit.input} aria-label="Stall key" placeholder="Stall key" autoCapitalize="off" value={key} onChange={(e) => { setKey(e.target.value); setLink(''); }} />
        <select className={kit.input} aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value); setLink(''); }}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <input className={kit.input} aria-label="Name" placeholder="Name (serving name, optional)" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setLink(''); }} />
        <button type="button" className={kit.cta} disabled={!ok} onClick={make}>Make link</button>
        {!ok && url ? <p className={s.warn}>Needs the https /exec link and the stall key</p> : null}
      </div>
      {link ? <LinkOut link={link} onCopy={copy} /> : null}
      {note ? <p className={s.syncHint} role="status">{note}</p> : null}
      <button type="button" className={s.hsBtn} disabled={!ok} onClick={() => { a.setPrefs({ syncUrl: url.trim(), syncKey: key.trim() }); window.location.reload(); }}>Use on this phone too</button>
    </StallPage>
  );
}
