/**
 * PWA install prompt (web only — the APK never needs it).
 *
 * Captures beforeinstallprompt so settings can show a real «نصب برنامه»
 * button instead of relying on the browser menu. One-shot per page load.
 */
import * as React from "react"
import { isNativeApp } from "@/lib/native-notify"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

interface PwaInstall {
  canInstall: boolean
  install: () => Promise<void>
}

export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = React.useState<InstallPromptEvent | null>(null)

  React.useEffect(() => {
    if (isNativeApp()) return

    if (typeof window === "undefined") return

    const onPrompt = (e: Event): void => {
      e.preventDefault()

      // SAFETY: this handler only runs for beforeinstallprompt, whose
      // shape (prompt + userChoice) is the documented platform contract.
      setDeferred(e as InstallPromptEvent)
    }

    const onInstalled = (): void => setDeferred(null)

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const install = React.useCallback(async () => {
    if (!deferred) return

    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* user dismissed or browser blocked — button simply stays */
    } finally {
      setDeferred(null)
    }
  }, [deferred])

  return { canInstall: deferred !== null, install }
}
