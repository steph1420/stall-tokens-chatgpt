// Haptics Off/Light/Normal/Strong (kit). Patterns come from the tokens.
import { HAPTICS, type HapticGrade } from '../../tokens/tokens';

export type HapticLevel = 'off' | 'light' | 'normal' | 'strong';
export function buzz(level: HapticLevel, grade: HapticGrade): void {
  if (level === 'off' || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const base: readonly number[] = HAPTICS[grade];
  const scale = level === 'light' ? 0.5 : level === 'strong' ? 1.6 : 1;
  navigator.vibrate(base.map((n) => Math.round(n * scale)));
}
