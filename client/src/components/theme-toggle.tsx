
import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { nextTheme, themeLabel, themeAnnouncement } from "@/lib/theme"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [announced, setAnnounced] = React.useState("")
  React.useEffect(() => setMounted(true), [])

  const label = themeLabel(theme)

  const toggle = () => {
    const next = nextTheme(theme)
    setTheme(next)
    // Screen readers don't re-announce a changed aria-label on the focused
    // button — mirror the change through a polite live region instead.
    setAnnounced(themeAnnouncement(next))
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
      >
        {mounted ? (
          <span className="relative size-4">
            <Sun
              className={cn(
                "absolute inset-0 size-4 transition-all duration-300",
                theme === "light"
                  ? "scale-100 opacity-100 blur-0"
                  : "scale-25 opacity-0 blur-[4px]",
              )}
            />
            <Moon
              className={cn(
                "absolute inset-0 size-4 transition-all duration-300",
                theme === "dark"
                  ? "scale-100 opacity-100 blur-0"
                  : "scale-25 opacity-0 blur-[4px]",
              )}
            />
            <Monitor
              className={cn(
                "absolute inset-0 size-4 transition-all duration-300",
                theme === "system"
                  ? "scale-100 opacity-100 blur-0"
                  : "scale-25 opacity-0 blur-[4px]",
              )}
            />
          </span>
        ) : (
          <span className="size-4" />
        )}
      </button>
      <span role="status" aria-atomic="true" className="sr-only">
        {announced}
      </span>
    </>
  )
}
