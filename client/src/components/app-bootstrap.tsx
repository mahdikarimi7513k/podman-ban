
import * as React from "react"
import { useApp } from "@/lib/store"
import { welcomeOnce } from "@/lib/welcome-notify"
import { showBroadcastOnce, startBroadcastWatcher } from "@/lib/notify-inbox"

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const boot = useApp((s) => s.boot)
  const booted = useApp((s) => s.booted)

  React.useEffect(() => {
    boot()
    // Native-only first-launch greeting + latest admin broadcast (web: toast).
    // Both are exactly-once and failure-silent — boot never depends on them.
    void welcomeOnce()
    void showBroadcastOnce()
    // Keep watching: broadcasts created after boot reach open apps too.
    const stopWatching = startBroadcastWatcher()

    return () => stopWatching()
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
