// F-19 Status icon + text label (Q-ICON). Priority bobs through motion/ only.
import type { Line, LineStatus } from '../../contract';
import { Bob } from '../../motion';
import { Icon, type IconName } from '../kit/Icon';
import s from './Kitchen.module.css';

export type Mark = Exclude<LineStatus, 'draft'> | 'priority';
const MARKS: Record<Mark, { icon: IconName; label: string; cls: string | undefined }> = {
  waiting: { icon: 'stWaiting', label: 'Waiting', cls: s.stWaiting },
  preparing: { icon: 'stPreparing', label: 'Preparing', cls: s.stPreparing },
  'done?': { icon: 'stDone', label: 'Ready', cls: s.stDone },
  ready: { icon: 'stReady', label: 'Ready', cls: s.stReady },
  held: { icon: 'stHeld', label: 'On hold', cls: s.stHeld },
  handed: { icon: 'stHanded', label: 'Handed over', cls: s.stHanded },
  paused: { icon: 'stPaused', label: 'Paused', cls: s.stPaused },
  priority: { icon: 'stPriority', label: 'Priority', cls: s.stPriority },
};
export const markLabel = (m: Mark): string => MARKS[m].label;

export function StatusMark({ mark, label = true, small = false, text }: { mark: Mark; label?: boolean; small?: boolean; text?: string }) {
  const m = MARKS[mark];
  const icon = <Icon name={m.icon} className={small ? s.stIconSm : s.stIcon} />;
  return (
    <span className={[s.st, m.cls].join(' ')} aria-label={label ? undefined : text ?? m.label} role={label ? undefined : 'img'}>
      {mark === 'priority' ? <Bob className={s.stBob}>{icon}</Bob> : icon}
      {label ? <span className={s.stL}>{text ?? m.label}</span> : null}
    </span>
  );
}

/** A line's mark; a line the Counter finished reads "Marked by counter" with the Ready icon (Q-COUNTER-FINISH). */
export function LineMark({ l, small = false }: { l: Line; small?: boolean }) {
  const mark: Mark = l.status === 'draft' ? 'waiting' : l.status;
  return <StatusMark mark={mark} small={small} {...(l.byCounter && l.status === 'ready' ? { text: 'Marked by counter' } : {})} />;
}
