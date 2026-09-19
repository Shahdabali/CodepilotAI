import type { Transition, Variants } from 'framer-motion'

/** Shared easing/timing so every surface in the app moves the same way. */
export const EASE = [0.22, 1, 0.36, 1] as const

export const springSnappy: Transition = { type: 'spring', stiffness: 460, damping: 36, mass: 0.8 }
export const springSoft: Transition = { type: 'spring', stiffness: 300, damping: 30, mass: 0.9 }
export const tweenFast: Transition = { duration: 0.16, ease: EASE }
export const tween: Transition = { duration: 0.26, ease: EASE }

/** Page-level transition between top-level views. */
export const viewVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: EASE } },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
}

export const listStagger = (gap = 0.045, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
})

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.12 } },
}

/** Height auto-animation for collapsible sections. */
export const collapse: Variants = {
  closed: { height: 0, opacity: 0, transition: { duration: 0.2, ease: EASE } },
  open: { height: 'auto', opacity: 1, transition: { duration: 0.26, ease: EASE } },
}
