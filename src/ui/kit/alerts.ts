// F-60 PK-1 / W-35 kitchen alerts, as built for Q-KITCHEN-ALERT (still a proposal; D-P3-ALERT): a new ticket gets a silent
// visual highlight only. A chime sits behind this interface (06 rule 4: audio behind an interface + fake) and is OFF by
// default; nothing here plays sound until Steve picks an option.
import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';

export interface Chime { play(kind: 'new' | 'priority'): void }
/** The default: no sound at all. */
export const silentChime: Chime = { play: () => undefined };

/** Ids that arrived after this screen opened, kept "fresh" for CONFIG.kitchen.newGlowMs (the first list is not new). */
export function useFreshIds(ids: readonly string[], chime: Chime = silentChime): ReadonlySet<string> {
  const key = ids.join(',');
  const [seen, setSeen] = useState<{ key: string; all: ReadonlySet<string> }>(() => ({ key, all: new Set(ids) }));
  const [fresh, setFresh] = useState<ReadonlyMap<string, number>>(new Map());
  if (seen.key !== key) {
    const added = ids.filter((id) => !seen.all.has(id));
    setSeen({ key, all: new Set([...seen.all, ...ids]) });
    if (added.length) {
      const until = Date.now() + CONFIG.kitchen.newGlowMs;
      setFresh((m) => new Map([...m, ...added.map((id) => [id, until] as const)]));
      chime.play('new');
    }
  }
  useEffect(() => {
    if (!fresh.size) return undefined;
    const t = window.setTimeout(() => { setFresh((m) => new Map([...m].filter(([, u]) => u > Date.now()))); }, Math.max(0, Math.min(...fresh.values()) - Date.now()));
    return () => { window.clearTimeout(t); };
  }, [fresh]);
  return new Set(fresh.keys());
}

/** W-28 / W-41: true for a moment after cards already on screen change places (a Priority order jumped in). */
/** `scope` = what the list shows (a filter or station); changing it is the person's own tap, so no guard. */
export function useReorderGuard(ids: readonly string[], scope = ''): boolean {
  const key = `${scope}|${ids.join(',')}`;
  const [prev, setPrev] = useState(key);
  const [until, setUntil] = useState(0);
  if (prev !== key) {
    const [was, list = ''] = prev.split('|');
    const before = new Set(was === scope && list ? list.split(',') : []);
    const now = new Set(ids);
    const kept = ids.filter((id) => before.has(id)).join(',');
    const keptBefore = [...before].filter((id) => now.has(id)).join(',');
    const insertedAbove = ids.some((id, i) => !before.has(id) && ids.slice(i + 1).some((x) => before.has(x)));
    const moved = kept !== keptBefore || insertedAbove;
    setPrev(key);
    if (moved) setUntil(Date.now() + CONFIG.kitchen.reorderGuardMs);
  }
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return undefined;
    const t = window.setTimeout(() => { setUntil(0); tick((n) => n + 1); }, Math.max(0, until - Date.now()));
    return () => { window.clearTimeout(t); };
  }, [until]);
  return until > 0;
}
