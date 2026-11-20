// D-NAV: the quiet "Stall" list, on the launch screen (third section) and in the Counter ⋯ sheet. Same rows in both.
import type { StallScreen } from '../../store';
import { extraOn, useApp } from '../../store';
import kit from '../kit/kit.module.css';

export const STALL_SCREENS: readonly { id: StallScreen; label: string; hint: string }[] = [
  { id: 'float', label: 'Open the stall', hint: 'Cash in the register, start the day' },
  { id: 'money', label: 'Money', hint: 'Spent, received, refunds due' },
  { id: 'settle', label: 'Settle up', hint: 'Repay others, split between partners' },
  { id: 'stock', label: 'Stock', hint: 'Counts, low and sold out, paste a bill' },
  { id: 'history', label: 'History', hint: 'Every order and money, per day' },
  { id: 'close', label: 'Close the day', hint: 'Unpaid, refunds, cash count, notes, summary' },
  { id: 'settings', label: 'Settings', hint: 'Kitchen, money, feel, passcode' },
];

export function StallNav({ className, onGo }: { className?: string | undefined; onGo?: () => void }) {
  const open = useApp((s) => s.openStall);
  // F-66: "Close the day" shows once a day has started and the shared switch is on (FEATURES §0.2, Q-P4-EXTRAS-ON A).
  const closeOn = useApp((s) => extraOn(s.folded.settings, 'closeDay') && s.folded.days.length > 0);
  return (
    <ul className={className ?? kit.list} aria-label="Stall">
      {STALL_SCREENS.filter((x) => x.id !== 'close' || closeOn).map((x) => (
        <li key={x.id}><button type="button" className={kit.listRow} onClick={() => { onGo?.(); open(x.id); }}>
          <span className={kit.navLab}>{x.label}</span><small className={kit.navHint}>{x.hint}</small></button></li>
      ))}
    </ul>
  );
}
