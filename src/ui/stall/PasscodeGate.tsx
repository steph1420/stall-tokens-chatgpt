// D-ACCESS passcode gate for Money, Settle up and Settings: 4 dots + digit keys. First use sets the code (typed twice).
// A light device gate, not a login; Settings > Developer can switch it off on this device.
import { useState } from 'react';
import { useApp } from '../../store';
import { Icon } from '../kit/Icon';
import s from './Stall.module.css';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;
const LEN = 4;

export function PasscodeGate() {
  const prefs = useApp((x) => x.prefs);
  const a = useApp((x) => x);
  const [code, setCode] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const setting = prefs.passcode === '';
  const done = (c: string) => {
    if (!setting) { if (c === prefs.passcode) a.unlock(); else a.money.toast('Wrong passcode'); setCode(''); return; }
    if (first === null) { setFirst(c); setCode(''); return; }
    if (c === first) { a.setPrefs({ passcode: c }); a.unlock(); a.money.toast('Passcode set'); } else { a.money.toast('Those did not match · try again'); setFirst(null); }
    setCode('');
  };
  const press = (k: (typeof DIGITS)[number]) => {
    if (k === 'del') { setCode(code.slice(0, -1)); return; }
    if (!k) return;
    const c = code + k;
    if (c.length === LEN) done(c); else setCode(c);
  };
  return (
    <div className={s.page}>
      <header className={s.floatTop}><button type="button" className={s.back} aria-label="Back" onClick={a.closeStall}><Icon name="chevLeft" /></button></header>
      <main className={s.gate}>
        <h1 className={s.floatH}>{setting ? (first === null ? 'Set a passcode' : 'Type it again') : 'Enter passcode'}</h1>
        <p className={s.floatSub}>{setting ? '4 digits · keeps money screens on this phone to you' : 'Money, Settle up and Settings'}</p>
        <div className={s.dots} aria-label={`${String(code.length)} of 4 digits`}>{Array.from({ length: LEN }, (_, i) => <span key={i} className={i < code.length ? s.dotOn : s.dotOff} />)}</div>
        <div className={s.pad}>
          {DIGITS.map((k, i) => (k ? <button type="button" key={k} className={s.padKey} aria-label={k === 'del' ? 'Delete' : k} onClick={() => { press(k); }}>{k === 'del' ? <Icon name="backspace" /> : k}</button> : <span key={`b${String(i)}`} />))}
        </div>
      </main>
    </div>
  );
}
