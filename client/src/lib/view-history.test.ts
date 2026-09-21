import { describe, it, expect } from "vitest"
import { pushViewState, replaceViewState, readViewState } from "./view-history"

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
