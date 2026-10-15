/**
 * PWA install prompt (web only — never inside the native APK).
 *
 * Captures beforeinstallprompt and exposes a guided install button.
 * If the event never fires (already installed, ineligible browser),
 * the hook simply reports unavailable and renders nothing.
 */
import * as React from "react"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isInstallPrompt(e: Event): e is InstallPromptEvent {
  // SAFETY: only the real beforeinstallprompt event carries a callable
  // prompt; anything else fails closed (returns false, prompt ignored).
  const candidate = e as Event & { prompt?: unknown }

  return candidate.prompt instanceof Function
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = React.useState<InstallPromptEvent | null>(null)
  const [installing, setInstalling] = React.useState(false)

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()

      if (isInstallPrompt(e)) setDeferred(e)
    }

    window.addEventListener("beforeinstallprompt", onPrompt)

    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  const install = React.useCallback(() => {
    if (!deferred) return

    setInstalling(true)

    void deferred
      .prompt()
      .catch(() => {})
      .finally(() => {
        setInstalling(false)
        setDeferred(null)
      })
  }, [deferred])

  return { available: deferred !== null, installing, install }
}
