/**
 * PWA install prompt: captures beforeinstallprompt once per page life and
 * exposes a guided install action. No-ops where the browser never fires
 * the event (iOS, already-installed, native APK).
 */
import * as React from "react"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isInstallPromptEvent(e: Event): e is InstallPromptEvent {
  return (
    "prompt" in e &&
    typeof (e as { prompt?: unknown }).prompt === "function"
  )
}

export function useInstallPrompt(): {
  canInstall: boolean
  installing: boolean
  install: () => Promise<void>
} {
  const [deferred, setDeferred] = React.useState<InstallPromptEvent | null>(null)
  const [installing, setInstalling] = React.useState(false)

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      if (!isInstallPromptEvent(e)) return

      e.preventDefault()
      setDeferred(e)
    }

    window.addEventListener("beforeinstallprompt", onPrompt)

    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  const install = React.useCallback(async () => {
    if (!deferred || installing) return

    setInstalling(true)

    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* dismissed or failed — stay put */
    } finally {
      setDeferred(null)
      setInstalling(false)
    }
  }, [deferred, installing])

  return { canInstall: deferred !== null, installing, install }
}
