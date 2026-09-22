import * as React from "react"
import { Chrome, Github, Loader2 } from "lucide-react"
import { apiFetch, ApiError, API_BASE } from "@/lib/api-client"
import { isNativeApp } from "@/lib/native-notify"
import type { AppUser } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface PendingOAuth {
  provider: "google" | "github"
  email: string
  name: string
}

interface SocialButtonsProps {
  enabled: { google: boolean; github: boolean }
  disabled?: boolean
  onDone: (user: AppUser) => void
  onPending: (pending: PendingOAuth) => void
  onError: (message: string) => void
}

/**
 * Google / GitHub sign-in buttons (brand-correct: white Google button,
 * near-black GitHub button, 44px targets, divider with "یا").
 *
 * Web: plain redirect to the start endpoint (cookies carry nothing —
 * the handshake state lives server-side).
 * Native APK: Google blocks embedded WebViews, so the provider opens in
 * the SYSTEM browser and returns over the app scheme; the ticket is
 * consumed from inside the WebView where the session cookies belong.
 * The dynamic imports keep @capacitor/* out of the web chunk.
 */
export function SocialButtons({ enabled, disabled, onDone, onPending, onError }: SocialButtonsProps) {
  const [busy, setBusy] = React.useState<"google" | "github" | null>(null)
  const urlListener = React.useRef<{ remove: () => Promise<void> } | null>(null)

  React.useEffect(() => {
    return () => {
      void urlListener.current?.remove()
      urlListener.current = null
    }
  }, [])

  if (!enabled.google && !enabled.github) return null

  const consumeTicket = async (ticket: string): Promise<void> => {
    try {
      const res = await apiFetch<{ user?: AppUser; pending?: PendingOAuth }>(
        "/api/auth/oauth/consume",
        { method: "POST", body: JSON.stringify({ ticket }) },
      )

      if (res.user) {
        onDone(res.user)

        return
      }

      if (res.pending) {
        onPending(res.pending)

        return
      }

      onError("ورود ناموفق بود — دوباره تلاش کنید.")
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "ورود ناموفق بود — دوباره تلاش کنید.")
    }
  }

  const startNative = async (provider: "google" | "github"): Promise<void> => {
    const { url } = await apiFetch<{ url: string }>(
      `${API_BASE}/api/auth/oauth/${provider}?mode=native`,
    )

    const { Browser } = await import("@capacitor/browser")

    const { App: CapApp } = await import("@capacitor/app")

    // Listen BEFORE opening: the round-trip can be instant on re-consent.
    await urlListener.current?.remove()
    urlListener.current = await CapApp.addListener("appUrlOpen", (ev) => {
      let ticket: string | null = null
      let error: string | null = null

      try {
        const u = new URL(ev.url)
        ticket = u.searchParams.get("ticket")
        error = u.searchParams.get("error")
      } catch {
        return
      }

      void urlListener.current?.remove()
      urlListener.current = null

      if (error || !ticket) {
        onError("ورود ناموفق بود — دوباره تلاش کنید.")

        return
      }

      void consumeTicket(ticket)
    })

    // If the user closes the browser without finishing, drop the listener
    // so a later tap starts fresh instead of double-firing.
    const finished = await Browser.addListener("browserFinished", () => {
      void urlListener.current?.remove()
      urlListener.current = null
      setBusy(null)
    })

    try {
      await Browser.open({ url })
    } finally {
      await finished.remove()
    }
  }

  const start = async (provider: "google" | "github"): Promise<void> => {
    if (busy || disabled) return
    setBusy(provider)

    try {
      if (isNativeApp()) {
        await startNative(provider)
      } else {
        window.location.href = `${API_BASE}/api/auth/oauth/${provider}?mode=web`
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "ورود ناموفق بود — دوباره تلاش کنید.")
      setBusy(null)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">یا</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-3 grid gap-2">
        {enabled.google && (
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || disabled}
            onClick={() => void start("google")}
            className="w-full h-11 text-sm cursor-pointer bg-white text-slate-800 hover:bg-slate-50 dark:bg-white dark:text-slate-800 dark:hover:bg-slate-100"
          >
            {busy === "google" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Chrome className="size-4 text-[#4285F4]" strokeWidth={2.25} />
            )}
            ادامه با گوگل
          </Button>
        )}
        {enabled.github && (
          <Button
            type="button"
            disabled={busy !== null || disabled}
            onClick={() => void start("github")}
            className={cn(
              "w-full h-11 text-sm cursor-pointer bg-[#24292f] text-white hover:bg-[#1b1f24]",
              "dark:bg-[#24292f] dark:text-white dark:hover:bg-[#1b1f24]",
            )}
          >
            {busy === "github" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Github className="size-4" strokeWidth={2.25} />
            )}
            ادامه با گیت‌هاب
          </Button>
        )}
      </div>
    </div>
  )
}
