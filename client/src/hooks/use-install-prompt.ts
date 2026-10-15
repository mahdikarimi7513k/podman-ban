/**
 * PWA install prompt (beforeinstallprompt).
 *
 * The browser fires this once per session when the app is installable and
 * not yet installed. We stash the deferred event and expose a guided
 * install button; dismissal remembers for this device. No-ops everywhere
 * the event never fires (iOS, already-installed, APK WebView).
 */
import * as React from "react"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISSED_KEY = "pb_install_dismissed"

export interface InstallPromptApi {
  canInstall: boolean
  installing: boolean
  install: () => void
  dismiss: () => void
}

export function useInstallPrompt(): InstallPromptApi {
  const [deferred, setDeferred] = React.useState<InstallPromptEvent | null>(null)
  const [installing, setInstalling] = React.useState(false)

  const dismissed = React.useCallback((): boolean => {
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === "1"
    } catch {
      return false
    }
  }, [])

  React.useEffect(() => {
    if (dismissed()) return

    const onPrompt = (e: Event) => {
      e.preventDefault()

      // SAFETY: this listener only fires for BeforeInstallPromptEvent, which
      // carries prompt()/userChoice — the interface below names that contract.
      setDeferred(e as InstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", onPrompt)

    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [dismissed])

  const install = React.useCallback(() => {
    if (!deferred) return
    setInstalling(true)

    void deferred
      .prompt()
      .then(() => deferred.userChoice)
      .catch(() => undefined)
      .then(() => {
        setInstalling(false)
        setDeferred(null)
      })
  }, [deferred])

  const dismiss = React.useCallback(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      /* ignore */
    }

    setDeferred(null)
  }, [])

  return { canInstall: deferred !== null, installing, install, dismiss }
}
