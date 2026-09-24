export type Theme = "dark" | "light" | "system"

/**
 * Theme-cycling policy for the single toggle button: light <-> dark only.
 * The "system" option was removed from the UI (settings + toggle) as
 * visual clutter; the provider still resolves a stored "system" value
 * correctly for accounts that picked it before, and it cycles to light.
 * The app default is light (App.tsx defaultTheme + theme-init.js
 * fallback), so any unknown/missing value cycles to "light".
 */
export function nextTheme(theme: string | undefined): Theme {
  if (theme === "light") return "dark"

  return "light"
}

/** Persian accessible label for the toggle button, keyed by current theme. */
export function themeLabel(theme: string | undefined): string {
  if (theme === "dark") return "تم: تاریک"

  if (theme === "system") return "تم: خودکار"

  return "تم: روشن"
}

/** Persian announcement for the aria-live region after a change. */
export function themeAnnouncement(theme: string | undefined): string {
  if (theme === "dark") return "تم تاریک شد"

  if (theme === "system") return "تم خودکار شد"

  return "تم روشن شد"
}
