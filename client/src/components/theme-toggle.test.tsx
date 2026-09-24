import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ThemeToggle } from "@/components/theme-toggle"

/**
 * Seam: ThemeToggle rendered behavior (DOM), with the local provider mocked.
 *
 * Contract:
 *   - The button's accessible label states the CURRENT theme in Persian
 *     (تم: تاریک / تم: روشن / تم: خودکار).
 *   - Clicking cycles dark -> light -> system -> dark (see lib/theme.ts).
 */

const mockState = vi.hoisted(() => ({
  theme: "dark",
  setThemeImpl: null as null | ((t: string) => void),
}))

vi.mock("@/lib/theme-provider", () => ({
  useTheme: () => ({
    theme: mockState.theme,
    setTheme: (t: string) => mockState.setThemeImpl?.(t),
  }),
}))

/** Harness owning real React state so clicks re-render like next-themes would. */
function Harness() {
  const [theme, setTheme] = React.useState<string>("dark")
  mockState.theme = theme
  mockState.setThemeImpl = setTheme as (t: string) => void
  return <ThemeToggle />
}

beforeEach(() => {
  cleanup()
  mockState.theme = "dark"
  mockState.setThemeImpl = null
})

afterEach(() => {
  cleanup()
})

describe("ThemeToggle", () => {
  it("labels itself with the current theme for assistive tech", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: "تم: تاریک" })).toBeInTheDocument()
  })

  it("cycles dark → light → dark across clicks", () => {
    render(<Harness />)
    const btn = screen.getByRole("button")

    fireEvent.click(btn)
    expect(screen.getByRole("button", { name: "تم: روشن" })).toBeInTheDocument()

    fireEvent.click(btn)
    expect(screen.getByRole("button", { name: "تم: تاریک" })).toBeInTheDocument()
  })

  it("announces the new theme politely after a change (screen readers)", () => {
    render(<Harness />)
    const btn = screen.getByRole("button")

    // No stale announcement before any interaction.
    expect(screen.queryByRole("status")).not.toHaveTextContent(/تم/)

    fireEvent.click(btn)
    expect(screen.getByRole("status")).toHaveTextContent("تم روشن شد")

    fireEvent.click(btn)
    expect(screen.getByRole("status")).toHaveTextContent("تم تاریک شد")
  })
})
