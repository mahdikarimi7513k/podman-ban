
import * as React from "react"

/**
 * Registers the service worker for offline support / Add-to-Home-Screen.
 * Only runs in production to avoid caching dev assets. Deferred to idle
 * (not window.load) so the installability signal doesn't wait behind
 * late assets — with load as the fallback.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!import.meta.env.PROD) return

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    let idle: number | null = null
    let done = false

    const register = () => {
      if (done) return
      done = true

      if (idle !== null) window.cancelIdleCallback?.(idle)
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silent — SW is a progressive enhancement */
      })
    }

    // Optional-chaining feature probe (no typeof, no assertion) with
    // window.load as the fallback where the API is missing.
    idle = window.requestIdleCallback?.(register, { timeout: 4000 }) ?? null
    window.addEventListener("load", register)

    return () => {
      window.removeEventListener("load", register)

      if (idle !== null) window.cancelIdleCallback?.(idle)
    }
  }, [])

  return null
}
