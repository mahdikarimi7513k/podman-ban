/**
 * View↔history sync (web back button + Android back button).
 *
 * Views are zustand state, invisible to the browser — without this, Back
 * exits the whole site (web) or kills the app mid-exam (APK). Only the exam
 * entry is ever pushed; every other navigation replaces, so the stack can
 * never trap the user: popping past the app entries exits naturally.
 *
 * Contract:
 *  - entering exam  → pushViewState("exam")
 *  - leaving exam   → replaceViewState(next)
 *  - popstate       → readViewState(); null (or the current view) means
 *    "nothing to do" — the browser exits on its own when the stack is ours.
 */
export const APP_VIEWS = [
  "auth",
  "home",
  "exam",
  "report",
  "settings",
  "calculator",
  "archive",
  "admin",
  "leaderboard",
  "achievements",
] as const

export function pushViewState(view: string): void {
  try {
    window.history.pushState({ appView: view }, "")
  } catch {
    /* history unavailable — navigation still works, back just exits */
  }
}

export function replaceViewState(view: string): void {
  try {
    window.history.replaceState({ appView: view }, "")
  } catch {
    /* same as above */
  }
}

/** The view recorded on the current history entry, or null. */
export function readViewState(): string | null {
  // SAFETY: entries are wiring we own (push/replace above); anything else
  // fails the allowlist comparison below instead of reaching setView.
  const s = window.history.state as { appView?: unknown } | null

  if (s === null || s === undefined) return null

  for (const known of APP_VIEWS) {
    if (s.appView === known) return known
  }

  return null
}
