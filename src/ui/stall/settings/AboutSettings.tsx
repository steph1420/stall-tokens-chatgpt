// About settings and Dev 7-tap trigger (Q-DEV-7TAP, Q-CHANNEL A, Q-HARM-7).
import { useRef, useState } from 'react';
import { appStamp, CONFIG } from '../../../config';
import { useApp } from '../../../store';
import { Sheet } from '../../kit/Sheet';
import { WHATS_NEW } from '../whatsNew';
import s from '../Stall.module.css';
import { Group, Opt } from './Opt';

function WhatsNewSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={WHATS_NEW.title} onClose={onClose}>
      <p className={s.syncHint}>{`Stall Tokens v${CONFIG.app.version}`}</p>
      <ul className={s.whatsList}>
        {WHATS_NEW.items.map((item) => (
          <li key={item} className={s.syncHint}>{item}</li>
        ))}
      </ul>
    </Sheet>
  );
}

export function AboutSettings({ onUnlockDev }: { onUnlockDev: () => void }) {
  const a = useApp((x) => x);
  const [whatsNew, setWhatsNew] = useState(false);
  const taps = useRef(0);
  const lastTap = useRef(0);

  const handleVersionTap = () => {
    const now = Date.now();
    taps.current = now - lastTap.current < 1500 ? taps.current + 1 : 1;
    lastTap.current = now;

    if (taps.current >= 3 && taps.current < 7) {
      a.money.toast(`${String(7 - taps.current)} steps away from Developer options`);
    } else if (taps.current >= 7) {
      taps.current = 0;
      onUnlockDev();
      a.money.toast('Developer options unlocked');
    }
  };

  return (
    <>
      <Group label="About">
        <Opt
          t="Version"
          sub={`${CONFIG.app.channelLabel} channel`}
          value={`${CONFIG.app.version} · ${CONFIG.app.channelLabel}`}
          onClick={handleVersionTap}
        />
        <Opt t="Device ID" value={a.prefs.deviceId.slice(0, 6)} />
      </Group>

      <button type="button" className={s.foot} aria-label="What's New" onClick={() => { setWhatsNew(true); }}>
        {appStamp()}
      </button>
      <p className={s.footSub}>{`device ${a.prefs.deviceId.slice(0, 6)}`}</p>
      {whatsNew ? <WhatsNewSheet onClose={() => { setWhatsNew(false); }} /> : null}
    </>
  );
}
