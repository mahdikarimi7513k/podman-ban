import { describe, it, expect } from "vitest"
import {
  pushViewState,
  replaceViewState,
  readViewState,
  resolvePopState,
  type PopContext,
} from "./view-history"

/**
 * Seam: history-state wiring (real jsdom history, no mocks).
 * Only allowlisted view names ever come back out.
 */
describe("view history", () => {
  it("round-trips pushed views", () => {
    pushViewState("exam")

    expect(readViewState()).toBe("exam")

    replaceViewState("home")

    expect(readViewState()).toBe("home")
  })

  it("returns null for foreign or empty states", () => {
    window.history.pushState(null, "")

    expect(readViewState()).toBeNull()

    window.history.pushState({ appView: "not-a-view" }, "")

    expect(readViewState()).toBeNull()

    window.history.pushState({ appView: 42 }, "")

    expect(readViewState()).toBeNull()
  })
})

/**
 * Seam: the pop policy is a pure function — every branch is pinned here so
 * the App handler can stay a thin switch.
 */
describe("resolvePopState", () => {
  const ctx = (over: Partial<PopContext> = {}): PopContext => ({
    dialogOpen: false,
    view: "home",
    signedIn: true,
    isAdmin: false,
    hasExamSession: false,
    ...over,
  })

  it("closes the dialog before anything else", () => {
    expect(resolvePopState("home", ctx({ dialogOpen: true, view: "exam" }))).toEqual({
      type: "dismiss-dialog",
    })
  })

  it("asks for exam exit instead of leaving a running exam", () => {
    expect(
      resolvePopState("home", ctx({ view: "exam", hasExamSession: true })),
    ).toEqual({ type: "confirm-exit" })
  })

  it("follows a valid previous entry", () => {
    expect(resolvePopState("report", ctx())).toEqual({ type: "follow", view: "report" })
  })

  it("ignores an entry that already matches the view", () => {
    expect(resolvePopState("home", ctx())).toEqual({ type: "ignore" })
  })

  it("leaves when popped below our own stack", () => {
    expect(resolvePopState(null, ctx())).toEqual({ type: "leave" })
  })

  it("retags entries that no longer apply to the session", () => {
    // auth entry while signed in
    expect(resolvePopState("auth", ctx())).toEqual({ type: "retag" })
    // admin entry while a student
    expect(resolvePopState("admin", ctx())).toEqual({ type: "retag" })
    // stale exam entry without a live session
    expect(resolvePopState("exam", ctx())).toEqual({ type: "retag" })
    // …but a real admin with a session follows normally
    expect(resolvePopState("admin", ctx({ isAdmin: true }))).toEqual({
      type: "follow",
      view: "admin",
    })
  })
})

/**
 * Seam: Back walks views instead of leaving (real jsdom history, no mocks).
 *
 * Regression target (Android APK): navigations used to replace the entry,
 * so the WebView stack never grew — canGoBack stayed false and every
 * hardware-back press fell through to minimizeApp, i.e. Back kicked the
 * user out of the app from ANY view. Every UI view change must push, so
 * Back has somewhere to go until the first entry.
 */
describe("back walks pushed views", () => {
  const ctx = (over: Partial<PopContext> = {}): PopContext => ({
    dialogOpen: false,
    view: "settings",
    signedIn: true,
    isAdmin: false,
    hasExamSession: false,
    ...over,
  })

  it("pushed views stack up and pop one by one with follow actions", async () => {
    // mount (replace) → boot to home (push) → open settings (push)
    replaceViewState("auth")
    pushViewState("home")
    pushViewState("settings")

    expect(readViewState()).toBe("settings")
    // Somewhere to go back to: the old code kept this at the single
    // mount entry, which is exactly what kicked the user out.
    expect(window.history.length).toBeGreaterThan(1)

    const seen: Array<string | null> = []

    // Await each traversal fully: two synchronous back() calls coalesce
    // into one navigation (spec aborts the pending one), so the second
    // back must wait for the first popstate.
    async function goBack(): Promise<void> {
      await new Promise<void>((resolve) => {
        const onPop = () => {
          window.removeEventListener("popstate", onPop)
          seen.push(readViewState())
          resolve()
        }

        window.addEventListener("popstate", onPop)
        window.history.back()
      })
    }

    await goBack()
    await goBack()

    expect(seen).toEqual(["home", "auth"])
    // …and the policy follows each revealed entry instead of leaving.
    expect(resolvePopState("home", ctx())).toEqual({ type: "follow", view: "home" })
  })
})
