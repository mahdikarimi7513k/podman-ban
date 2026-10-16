
import * as React from "react"

/**
 * Registers the service worker for offline support / Add-to-Home-Screen.
 * Only runs in production to avoid caching dev assets. Registers eagerly
 * (not on window.load) so installability is ready before first paint work
 * finishes; registration itself never blocks rendering.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!import.meta.env.PROD) return

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* silent — SW is a progressive enhancement */
    })
  }, [])

  return null
}
