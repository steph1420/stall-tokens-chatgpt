// Display settings: Appearance (Night/Day/Auto), Haptics, Kitchen text size, Alert tone (F-69).
import { useState } from 'react';
import { CONFIG } from '../../../config';
import { useApp } from '../../../store';
import { Sheet } from '../../kit/Sheet';
import kit from '../../kit/kit.module.css';
import { Group, Opt, nextOpt } from './Opt';

const THEMES = { night: 'Night', day: 'Day', auto: 'Auto (System)' } as const;
const HAPTICS = { off: 'Off', light: 'Light', normal: 'Normal', strong: 'Strong' } as const;
const KITCHEN_TEXT = { normal: 'Standard', large: 'Large', xl: 'Extra Large' } as const;
const TONES = { chime: 'Chime', bell: 'Bell', pluck: 'Pluck', harp: 'Harp' } as const;

function TonePreviewSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const current = a.prefs.alertTone;

  return (
    <Sheet title="Kitchen Alert Tone" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ margin: '0 0 0.5rem', color: 'var(--dl-color-text-muted)', fontSize: '0.875rem' }}>
          Select the alert tone played when a new order arrives in the kitchen.
        </p>
        {CONFIG.alertTones.map((tone) => (
          <button
            type="button"
            key={tone}
            className={current === tone ? kit.choiceOn : kit.choice}
            onClick={() => {
              a.setPrefs({ alertTone: tone });
              a.money.toast(`Alert tone set to ${TONES[tone]}`);
              onClose();
            }}
          >
            {TONES[tone]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function KitchenDisplayOpts({ onOpenTone }: { onOpenTone: () => void }) {
  const a = useApp((x) => x);
  const p = a.prefs;
  return (
    <>
      <Opt
        t="Kitchen text size"
        sub="Large text for kitchen and station tablets"
        value={KITCHEN_TEXT[p.kitchenText]}
        onClick={() => {
          a.setPrefs({ kitchenText: nextOpt(['normal', 'large', 'xl'] as const, p.kitchenText) });
        }}
      />
      <Opt t="Kitchen alert tone" sub="Plays when a new ticket arrives" value={TONES[p.alertTone]} onClick={onOpenTone} />
      <Opt t="Quiet mode" sub="Mute kitchen alert tones (visual flash only)" sw={p.quiet} onClick={() => { a.setPrefs({ quiet: !p.quiet }); }} />
    </>
  );
}

export function DisplaySettings() {
  const a = useApp((x) => x);
  const p = a.prefs;
  const [toneSheet, setToneSheet] = useState(false);

  return (
    <Group label="Display">
      <Opt
        t="Appearance"
        sub="Night for evenings · Day for bright sun · Auto follows phone"
        value={THEMES[p.theme]}
        onClick={() => {
          a.setPrefs({ theme: nextOpt(['night', 'day', 'auto'] as const, p.theme) });
        }}
      />
      <Opt
        t="Haptics"
        value={HAPTICS[p.haptics]}
        onClick={() => {
          a.setPrefs({ haptics: nextOpt(['off', 'light', 'normal', 'strong'] as const, p.haptics) });
        }}
      />
      <KitchenDisplayOpts onOpenTone={() => { setToneSheet(true); }} />
      {toneSheet ? <TonePreviewSheet onClose={() => { setToneSheet(false); }} /> : null}
    </Group>
  );
}
