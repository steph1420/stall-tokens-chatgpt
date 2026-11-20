// motion/: the only module that imports framer-motion (dependency-cruiser). Screens ask for movement here.
// Springs come from the motion tokens. Reduced motion falls back to a short fade, no travel. Transform and opacity only.
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import { DURATION, LOOPS, SPRINGS } from './tokens';

export type SpringName = keyof typeof SPRINGS;
const MS_PER_S = 1000;

export const reducedTransition: Transition = { duration: DURATION.instant / MS_PER_S };
export function pick(name: SpringName, reduce: boolean | null): Transition {
  return reduce ? reducedTransition : (SPRINGS[name] as Transition);
}

const TRAVEL = '0.75rem';
export const variants = {
  full: { hidden: { opacity: 0, y: TRAVEL }, shown: { opacity: 1, y: 0 } },
  fade: { hidden: { opacity: 0 }, shown: { opacity: 1 } },
} as const;

/** One list row that rises in (or fades, with reduced motion). Same transition in and out. */
export function RiseIn({ children, className }: { children: ReactNode; className?: string | undefined }) {
  const reduce = useReducedMotion();
  return (
    <motion.li layout={!reduce} className={className} variants={reduce ? variants.fade : variants.full}
      initial="hidden" animate="shown" exit="hidden" transition={pick('smooth', reduce)}>
      {children}
    </motion.li>
  );
}

export function Presence({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

const BOB: Transition = { duration: LOOPS.priorityBob.periodMs / MS_PER_S, repeat: Infinity, ease: 'easeInOut' };
/** Q-ICON: the Priority chevron bobs up and down. Reduced motion: still. */
export function Bob({ children, className }: { children: ReactNode; className?: string | undefined }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{children}</span>;
  return (
    <motion.span className={className} animate={{ y: ['0rem', `${String(LOOPS.priorityBob.liftRem)}rem`, '0rem'] }} transition={BOB}>
      {children}
    </motion.span>
  );
}

const POP = { hidden: { opacity: 0, scale: 0.8 }, shown: { opacity: 1, scale: 1 } } as const;
/** Q-OVERLAY: a badge that scales in gently (reduced motion: short fade, no scale). */
export function PopIn({ children, className }: { children: ReactNode; className?: string | undefined }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? variants.fade : POP} initial="hidden" animate="shown" transition={pick('gentle', reduce)}>
      {children}
    </motion.div>
  );
}
