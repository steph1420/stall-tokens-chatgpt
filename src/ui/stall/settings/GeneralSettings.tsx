// General settings: business identity and this device's serving label.
import { useState } from 'react';
import { useApp } from '../../../store';
import { Sheet } from '../../kit/Sheet';
import kit from '../../kit/kit.module.css';
import { Group, Opt } from './Opt';

function EditStallNameSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const [val, setVal] = useState(a.folded.settings.stallName ?? '');

  const save = () => {
    a.catalog.setSetting('stallName', val);
    a.money.toast('Stall name updated');
    onClose();
  };

  return (
    <Sheet title="Edit Stall Name" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input className={kit.input} placeholder="Stall name (e.g. Chai & Samosa)" value={val} onChange={(e) => { setVal(e.target.value); }} />
        <button type="button" className={kit.cta} onClick={save}>Save Stall Name</button>
      </div>
    </Sheet>
  );
}

function EditEventNameSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const [val, setVal] = useState(a.folded.settings.eventName ?? '');
  const save = () => {
    a.catalog.setSetting('eventName', val);
    a.money.toast('Event name updated');
    onClose();
  };
  return (
    <Sheet title="Edit Event Name" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input className={kit.input} placeholder="e.g. Winter Carnival" value={val} onChange={(e) => { setVal(e.target.value); }} />
        <button type="button" className={kit.cta} onClick={save}>Save Event Name</button>
      </div>
    </Sheet>
  );
}

function EditServingNameSheet({ onClose }: { onClose: () => void }) {
  const a = useApp((x) => x);
  const [val, setVal] = useState(a.prefs.servingName);

  const save = () => {
    a.setPrefs({ servingName: val.trim() });
    a.money.toast('Serving name updated');
    onClose();
  };

  return (
    <Sheet title="Serving Name / Device Label" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--dl-color-text-muted)' }}>
          This phone&#39;s name shown on kitchen tickets and tokens.
        </p>
        <input className={kit.input} placeholder="e.g. Counter 1, Window, Takeaway" value={val} onChange={(e) => { setVal(e.target.value); }} />
        <button type="button" className={kit.cta} onClick={save}>Save Serving Name</button>
      </div>
    </Sheet>
  );
}

export function GeneralSettings() {
  const a = useApp((x) => x);
  const p = a.prefs;
  const [stallSheet, setStallSheet] = useState(false);
  const [servingSheet, setServingSheet] = useState(false);
  const [eventSheet, setEventSheet] = useState(false);

  return (
    <Group label="General">
      <Opt
        t="Name of bus"
        sub="Shared with every phone"
        value={a.folded.settings.stallName || 'Not set'}
        onClick={() => { setStallSheet(true); }}
      />
      <Opt
        t="Name of event"
        sub="Printed on receipts and order slips"
        value={a.folded.settings.eventName || 'Not set'}
        onClick={() => { setEventSheet(true); }}
      />
      <Opt
        t="Serving name"
        sub="Label for this counter device"
        value={p.servingName || 'Not set'}
        onClick={() => { setServingSheet(true); }}
      />
      {stallSheet ? <EditStallNameSheet onClose={() => { setStallSheet(false); }} /> : null}
      {eventSheet ? <EditEventNameSheet onClose={() => { setEventSheet(false); }} /> : null}
      {servingSheet ? <EditServingNameSheet onClose={() => { setServingSheet(false); }} /> : null}
    </Group>
  );
}
