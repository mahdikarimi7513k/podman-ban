/**
 * ErrorBoundary: a render crash shows recovery UI (never a white screen).
 * Uses the real store and the real (best-effort) reporter — no mocks.
 */
import * as React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ErrorBoundary } from "@/components/error-boundary"
import { useApp } from "@/lib/store"

function Boom(): React.ReactNode {
  throw new Error("kaboom")
}

beforeEach(() => {
  cleanup()
  vi.spyOn(console, "error").mockImplementation(() => {})

  // jsdom has no backend: relative /api/client-logs posts fail silently
  // inside the reporter's own catch — the boundary must still render.
  useApp.setState({ view: "home" })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("ErrorBoundary", () => {
  it("renders recovery UI with an error id on crash", async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /تلاش مجدد/ })).toBeInTheDocument()
    expect(screen.getByText(/کد خطا:/)).toBeInTheDocument()
  })

  it("recovers the view on retry", async () => {
    let crash = true

    function Maybe(): React.ReactNode {
      if (crash) throw new Error("kaboom")

      return <p>healed</p>
    }

    render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    )

    expect(await screen.findByRole("alert")).toBeInTheDocument()

    crash = false
    fireEvent.click(screen.getByRole("button", { name: /تلاش مجدد/ }))
    expect(await screen.findByText("healed")).toBeInTheDocument()
  })
})
