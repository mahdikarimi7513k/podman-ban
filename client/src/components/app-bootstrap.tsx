
import * as React from "react"
import { useApp } from "@/lib/store"

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const boot = useApp((s) => s.boot)
  const booted = useApp((s) => s.booted)

  React.useEffect(() => {
    boot()
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
