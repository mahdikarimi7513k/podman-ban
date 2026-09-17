export type Theme = "dark" | "light" | "system"

/**
 * Theme-cycling policy for the single toggle button.
 * The app default is dark, so any unknown/missing value cycles to "dark".
 */
export function nextTheme(theme: string | undefined): Theme {
  if (theme === "dark") return "light"
  if (theme === "light") return "system"
  return "dark"
}

/** Persian accessible label for the toggle button, keyed by current theme. */
export function themeLabel(theme: string | undefined): string {
  if (theme === "light") return "تم: روشن"
  if (theme === "system") return "تم: خودکار"
  return "تم: تاریک"
}

/** Persian announcement for the aria-live region after a change. */
export function themeAnnouncement(theme: string | undefined): string {
  if (theme === "light") return "تم روشن شد"
  if (theme === "system") return "تم خودکار شد"
  return "تم تاریک شد"
}
