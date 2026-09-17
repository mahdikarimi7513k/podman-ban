import { describe, expect, it } from "vitest"
import { nextTheme, themeLabel } from "@/lib/theme"

/**
 * Seam: nextTheme() — pure theme-cycling policy used by ThemeToggle.
 *
 * Contract (matches app default of dark):
 *   dark -> light -> system -> dark
 *   anything else/missing falls back to the app default: "dark".
 */
describe("nextTheme", () => {
  it("cycles dark to light", () => {
    expect(nextTheme("dark")).toBe("light")
  })

  it("cycles light to system", () => {
    expect(nextTheme("light")).toBe("system")
  })

  it("cycles system back to dark", () => {
    expect(nextTheme("system")).toBe("dark")
  })

  it("falls back to dark for undefined (first interaction)", () => {
    expect(nextTheme(undefined)).toBe("dark")
  })

  it("falls back to dark for unknown values", () => {
    expect(nextTheme("blue")).toBe("dark")
  })
})

describe("themeLabel", () => {
  it("labels each theme in Persian for the toggle's accessible name", () => {
    expect(themeLabel("dark")).toBe("تم: تاریک")
    expect(themeLabel("light")).toBe("تم: روشن")
    expect(themeLabel("system")).toBe("تم: خودکار")
  })

  it("treats unknown values as the default (dark) label", () => {
    expect(themeLabel(undefined)).toBe("تم: تاریک")
  })
})
