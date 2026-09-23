import * as React from "react"
import type { Theme } from "@/lib/theme"

/**
 * Minimal theme provider replacing next-themes.
 *
 * Why local: next-themes renders an inline `<script
 * dangerouslySetInnerHTML>` on every mount, and React logs
 * "Encountered a script tag while rendering React component" each time
 * (dev) while neutering the script (it never executes client-side).
 * The blocking external `theme-init.js` in index.html already applies
 * the persisted theme before first paint, so the inline script was pure
 * redundancy + console noise. This provider keeps the exact contract
 * the app relies on:
 *  - same localStorage key ("theme") and values (light/dark/system),
 *  - same default ("light") and pre-paint fallback as theme-init.js,
 *  - same `dark` class + colorScheme application on documentElement,
 *  - transitions disabled during the switch (was disableTransitionOnChange),
 *  - OS changes followed while "system" is selected,
 *  - cross-tab sync via the storage event.
 */

const STORAGE_KEY = "theme"

const DEFAULT_THEME: Theme = "light"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
})

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext)
}

function parseTheme(value: string | null): Theme {
  if (value === "dark" || value === "light" || value === "system") return value

  return DEFAULT_THEME
}

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme): void {
  const resolved = theme === "system" ? systemTheme() : theme

  document.documentElement.classList.toggle("dark", resolved === "dark")
  document.documentElement.style.colorScheme = resolved
}

/** Momentarily kill transitions so the switch is instant, not animated. */
function withoutTransition(apply: () => void): void {
  const style = document.createElement("style")

  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;transition:none!important}",
    ),
  )
  document.head.appendChild(style)
  apply()
  window.getComputedStyle(document.body)

  window.setTimeout(() => {
    document.head.removeChild(style)
  }, 1)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    try {
      return parseTheme(localStorage.getItem(STORAGE_KEY))
    } catch {
      return DEFAULT_THEME
    }
  })

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (): void => {
      applyTheme("system")
    }
    mq.addEventListener("change", onChange)

    return () => {
      mq.removeEventListener("change", onChange)
    }
  }, [theme])

  React.useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return

      setThemeState(parseTheme(e.newValue))
    }
    window.addEventListener("storage", onStorage)

    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const setTheme = React.useCallback((next: Theme): void => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode — state still updates for this session */
    }

    // Apply to the DOM synchronously (like the mount effect below, which
    // stays the source of truth): the transition killer only spans this
    // synchronous window.
    withoutTransition(() => {
      applyTheme(next)
      setThemeState(next)
    })
  }, [])

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
