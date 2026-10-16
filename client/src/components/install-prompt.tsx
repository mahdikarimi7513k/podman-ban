/**
 * PWA install prompt (web only — the event never fires inside the APK).
 * Browsers fire beforeinstallprompt once per session when the app is
 * installable; we stash it and surface a native-feeling install button.
 */
import * as React from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ICON_STROKE } from "@/lib/utils"

interface PromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<PromptEvent | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()

      // SAFETY: the beforeinstallprompt event is defined to carry
      // prompt()/userChoice — the cast only names the platform shape.
      setDeferred(e as PromptEvent)
    }

    window.addEventListener("beforeinstallprompt", onPrompt)

    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  if (!deferred) return null

  const install = async () => {
    setBusy(true)

    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* dismissed */
    } finally {
      setDeferred(null)
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void install()}
      disabled={busy}
      className="w-full h-11 cursor-pointer"
    >
      <Download className="size-4" strokeWidth={ICON_STROKE} />
      نصب برنامه روی گوشی
    </Button>
  )
}
