// Motion tokens: the only source of spring and timing numbers (06 rule 3). Generated from Driftline tokens.json.
export { SPRINGS, DURATION } from '../tokens/tokens';
/** Looping attention moves (Q-ICON priority chevron, 21-polish2/kitchen.html `priority-pulse`: 1.6 s, 3 px lift). */
export const LOOPS = { priorityBob: { periodMs: 1600, liftRem: -0.1875 } } as const;
