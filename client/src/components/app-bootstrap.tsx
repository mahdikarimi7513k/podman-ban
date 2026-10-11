
import * as React from "react"
import { useApp } from "@/lib/store"
import { onSessionDead, onSiteLocked } from "@/lib/api-client"
import { showBroadcastOnce, startBroadcastWatcher } from "@/lib/notify-inbox"
import { startDailyGoalReminder } from "@/lib/daily-goal-reminder"
import { installErrorReporting } from "@/lib/error-report"
import { installStudyTimerActions } from "@/lib/study-timer-notify"
import { useToast } from "@/hooks/use-toast"

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const boot = useApp((s) => s.boot)
  const booted = useApp((s) => s.booted)
  const { toast } = useToast()

  React.useEffect(() => {
    boot()

    // Fresh session → fresh deploy gets its one chunk-reload if needed.
    try {
      window.sessionStorage.removeItem("pb_chunk_reloaded")
    } catch {
      /* ignore */
    }

    // Client crash telemetry → /api/client-logs (throttled, best-effort).
    installErrorReporting()
    // Shade actions for the study timer (native APK only, no-op on web).
    installStudyTimerActions()
    // Dead session (deleted account, password change elsewhere, 30-day
    // expiry): leave the broken state for the login screen with an
    // explanation instead of 401-spinning forever.
    onSessionDead(() => {
      void useApp.getState().signOut()
      toast({ title: "نشست به پایان رسید — دوباره وارد شو" })
    })
    // Site lock lands on already-logged-in clients two ways: instantly on
    // the next 503, plus a quiet 60s config poll as a backstop.
    onSiteLocked(() => {
      void useApp.getState().refreshConfig()
    })
    // Latest admin broadcast (web: toast). Exactly-once, failure-silent.
    void showBroadcastOnce()
    // Broadcast watcher + nightly goal reminder (23:00 Tehran).
    const stopWatching = startBroadcastWatcher()
    const stopReminder = startDailyGoalReminder()

    // Quiet config poll so an admin site-lock reaches logged-in clients
    // within a minute even when they make no API calls.
    const configPoll = window.setInterval(() => {
      if (document.visibilityState === "visible") void useApp.getState().refreshConfig()
    }, 60_000)

    return () => {
      stopWatching()
      stopReminder()
      window.clearInterval(configPoll)
    }
  }, [boot])

  if (!booted) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div
          className="size-10 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin"
          aria-label="در حال بارگذاری"
          role="status"
        />
      </div>
    )
  }

  return <>{children}</>
}
