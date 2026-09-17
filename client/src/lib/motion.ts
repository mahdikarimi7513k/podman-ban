import type { Transition, Variants } from "framer-motion"

/**
 * App-wide motion standard — one ease, three durations, shared variants.
 *
 * Soft decelerating ease (the GSAP "power2.out" feel); transforms stay on
 * the Y axis + opacity so nothing breaks in RTL. Directional (x) motion is
 * intentionally absent. Global `reducedMotion="user"` (see App.tsx) disables
 * all of this for users who prefer reduced motion.
 */

export const EASE_STANDARD: [number, number, number, number] = [0.2, 0, 0, 1]

export const DURATION = {
  fast: 0.15, // view switches, tab swaps
  base: 0.25, // entrances, expand/collapse
  slow: 0.35, // large panels, first paint
} as const

export const transitionFast: Transition = { duration: DURATION.fast, ease: EASE_STANDARD }
export const transitionBase: Transition = { duration: DURATION.base, ease: EASE_STANDARD }

/** View-to-view + card entrance: fade with a small rise. */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

/** Height-expand for collapsible admin sections. */
export const expandCollapse: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
}
