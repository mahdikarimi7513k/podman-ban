/**
 * Exam countdown thresholds (seconds of remaining time).
 *
 * Firing rules (checked once per tick, wall-clock):
 *  - 300 / 60  → toast + vibration + polite announcement
 *  - 30 / 10   → assertive announcement only (no toast spam)
 * firedThresholds() is pure so the policy is unit-testable; ExamTimer
 * owns the once-only bookkeeping.
 */

export const TIMER_THRESHOLDS = [300, 60, 30, 10] as const

/** Thresholds crossed downward between two consecutive remaining values. */
export function firedThresholds(prevRemSec: number, remSec: number): Array<number> {
  const fired: Array<number> = []

  for (const t of TIMER_THRESHOLDS) {
    if (prevRemSec > t && remSec <= t) fired.push(t)
  }

  return fired
}

/** Best-effort haptics — never throws, even where vibrate is absent. */
export function vibrate(pattern: number | Array<number>): void {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern)
  } catch {
    /* ignore */
  }
}
