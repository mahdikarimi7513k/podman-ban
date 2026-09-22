/**
 * View↔history sync (web back button + Android back button).
 *
 * Views are zustand state, invisible to the browser — without this, Back
 * exits the whole site (web) or kills the app mid-exam (APK). Every UI view
 * change pushes an entry (App.tsx reconcile effect), so Back walks views
 * backwards and only leaves once the stack is exhausted. All popstate policy
 * lives in one pure decision function (resolvePopState) so the web handler,
 * the hardware-key handler, and the tests share exactly one rule set.
 *
 * Contract:
 *  - UI view change → pushViewState(view)      [reconcile effect in App.tsx]
 *  - leaving exam   → replaceViewState("home") [store.exitExam — session is
 *                                               gone, the entry must not
 *                                               advertise a dead exam view]
 *  - popstate       → resolvePopState(state, ctx), then act on the action:
 *      dismiss-dialog / confirm-exit → re-stick the current view (the pop
 *        moved the stack while the visible view stayed put)
 *      follow  → setView through the popFollow flag (no second push)
 *      retag   → replaceViewState(current) for entries that no longer apply
 *                (auth while signed in, admin while student, exam without a
 *                session) so the next Back walks past them
 *      ignore  → landed on an entry that already matches the view
 *      leave   → popped past our own entries — the browser exits on its own
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

/** The closed set of view names — history only ever round-trips these. */
export type AppView = (typeof APP_VIEWS)[number]

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
export function readViewState(): AppView | null {
  // SAFETY: entries are wiring we own (push/replace above); anything else
  // fails the allowlist comparison below instead of reaching setView.
  const s = window.history.state as { appView?: unknown } | null

  if (s === null || s === undefined) return null

  for (const known of APP_VIEWS) {
    if (s.appView === known) return known
  }

  return null
}

/** Everything the pop policy needs to know about the live app state. */
export interface PopContext {
  /** exam exit-confirm dialog is open */
  dialogOpen: boolean
  /** the view currently on screen */
  view: AppView
  /** a user is signed in (the auth view no longer applies) */
  signedIn: boolean
  /** current user may open the admin view */
  isAdmin: boolean
  /** an exam session id is live (view "exam" is only real with one) */
  hasExamSession: boolean
}

export type PopAction =
  | { type: "dismiss-dialog" }
  | { type: "confirm-exit" }
  | { type: "follow"; view: AppView }
  | { type: "retag" }
  | { type: "ignore" }
  | { type: "leave" }

/**
 * The popstate policy as one pure function: same (state, ctx) → same action.
 * Branch order is the policy — dialog first (back closes it), then the exam
 * guard (back inside an exam asks instead of leaving), then stack/entry
 * validity. Tests pin every branch without driving a real history.
 */
export function resolvePopState(
  state: AppView | null,
  ctx: PopContext,
): PopAction {
  if (ctx.dialogOpen) return { type: "dismiss-dialog" }

  if (ctx.view === "exam") return { type: "confirm-exit" }

  if (state === null) return { type: "leave" }

  if (state === ctx.view) return { type: "ignore" }

  // Stale-for-context entries: showing them would break the session contract.
  if (state === "auth" && ctx.signedIn) return { type: "retag" }

  if (state === "admin" && !ctx.isAdmin) return { type: "retag" }

  if (state === "exam" && !ctx.hasExamSession) return { type: "retag" }

  return { type: "follow", view: state }
}
