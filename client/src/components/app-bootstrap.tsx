
import * as React from "react"
import { useApp } from "@/lib/store"
import { showBroadcastOnce, startBroadcastWatcher } from "@/lib/notify-inbox"
import { startDailyGoalReminder } from "@/lib/daily-goal-reminder"
import { installErrorReporting } from "@/lib/error-report"
import { installStudyTimerActions } from "@/lib/study-timer-notify"

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const boot = useApp((s) => s.boot)
  const booted = useApp((s) => s.booted)

  React.useEffect(() => {
    boot()
    // Client crash telemetry → /api/client-logs (throttled, best-effort).
    installErrorReporting()
    // Shade actions for the study timer (native APK only, no-op on web).
    installStudyTimerActions()
    // Latest admin broadcast (web: toast). Exactly-once, failure-silent.
    void showBroadcastOnce()
    // Broadcast watcher + nightly goal reminder (23:00 Tehran).
    const stopWatching = startBroadcastWatcher()
    const stopReminder = startDailyGoalReminder()

    return () => {
      stopWatching()
      stopReminder()
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
