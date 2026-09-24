import { describe, expect, it } from "vitest"
import { nextTheme, themeLabel } from "@/lib/theme"

/**
 * Seam: nextTheme() — pure theme-cycling policy used by ThemeToggle.
 *
 * Contract (matches app default of light — App.tsx + theme-init.js):
 *   light -> dark -> light (no system stop; stored legacy "system"
 *   values land on light, the provider still resolves them live).
 *   anything else/missing falls back to the app default: "light".
 */
describe("nextTheme", () => {
  it("cycles light to dark", () => {
    expect(nextTheme("light")).toBe("dark")
  })

  it("cycles dark back to light", () => {
    expect(nextTheme("dark")).toBe("light")
  })

  it("moves legacy system values to light", () => {
    expect(nextTheme("system")).toBe("light")
  })

  it("falls back to light for undefined (first interaction)", () => {
    expect(nextTheme(undefined)).toBe("light")
  })

  it("falls back to light for unknown values", () => {
    expect(nextTheme("blue")).toBe("light")
  })
})

describe("themeLabel", () => {
  it("labels each theme in Persian for the toggle's accessible name", () => {
    expect(themeLabel("dark")).toBe("تم: تاریک")
    expect(themeLabel("light")).toBe("تم: روشن")
    expect(themeLabel("system")).toBe("تم: خودکار")
  })

  it("treats unknown values as the default (light) label", () => {
    expect(themeLabel(undefined)).toBe("تم: روشن")
  })
})
