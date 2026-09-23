import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import * as React from "react"
import { ThemeProvider, useTheme } from "@/lib/theme-provider"

/**
 * Seam: local theme provider (real DOM + real localStorage, stubbed
 * matchMedia). Pins the next-themes replacement contract:
 *  - NO <script> tag is ever rendered (React logs "Encountered a script
 *    tag while rendering" for those, and neuters them client-side —
 *    theme-init.js already covers pre-paint).
 *  - persisted/dark/system resolution matches theme-init.js semantics.
 */

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    configurable: true,
  })
}

function Probe() {
  const { theme, setTheme } = useTheme()

  return (
    <button type="button" onClick={() => setTheme("dark")}>
      current:{theme}
    </button>
  )
}

beforeEach(() => {
  cleanup()
  stubMatchMedia(false)
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  document.documentElement.style.colorScheme = ""
})

describe("ThemeProvider", () => {
  it("renders children without any script tag (no console noise)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const { container } = render(
        <ThemeProvider>
          <span>hello</span>
        </ThemeProvider>,
      )

      expect(container.querySelector("script")).toBeNull()
      expect(
        err.mock.calls.some((c) => String(c[0]).includes("script tag")),
      ).toBe(false)
    } finally {
      err.mockRestore()
    }
  })

  it("applies the stored theme class on mount", () => {
    localStorage.setItem("theme", "dark")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(screen.getByText("current:dark")).toBeInTheDocument()
  })

  it("falls back to light on missing or unknown stored values", () => {
    localStorage.setItem("theme", "neon")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(screen.getByText("current:light")).toBeInTheDocument()
  })

  it("setTheme persists and toggles the class", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole("button"))

    expect(localStorage.getItem("theme")).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(screen.getByText("current:dark")).toBeInTheDocument()
  })

  it("resolves system from the OS preference", () => {
    stubMatchMedia(true)
    localStorage.setItem("theme", "system")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(screen.getByText("current:system")).toBeInTheDocument()
  })
})
