// Station look-up for screens: index (colour token + icon) by working name (Q-KITCHEN-2 C, CONFIG.stations).
import { CONFIG } from '../../config';
import type { IconName } from '../kit/Icon';

const ICONS: readonly IconName[] = ['tortillas', 'momos', 'desserts', 'sandwiches', 'cutlets', 'beverages'];
export const STATIONS: readonly string[] = CONFIG.stations;
export const stationIndex = (name: string): number => Math.max(0, STATIONS.indexOf(name));
export const stationIcon = (name: string): IconName => ICONS[stationIndex(name) % ICONS.length] ?? 'beverages';
/** CSS custom property that colours a station's pill, bar and title. */
export const stationVar = (name: string): React.CSSProperties => ({ '--c': `var(--dl-stall-station-${String(stationIndex(name))})` } as React.CSSProperties);
