
import * as React from "react"

/**
 * Registers the service worker for offline support / Add-to-Home-Screen.
 * Only runs in production to avoid caching dev assets. Registers
 * immediately (idle) instead of waiting for window.load so installability
 * and offline caching don't depend on every asset finishing first.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!import.meta.env.PROD) return

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silent — SW is a progressive enhancement */
      })
    }

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(register, { timeout: 3000 })

      return () => window.cancelIdleCallback(id)
    }

    register()

    return undefined
  }, [])

  return null
}
