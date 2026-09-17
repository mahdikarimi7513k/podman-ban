
import * as React from "react"

/**
 * Registers the service worker for offline support / Add-to-Home-Screen.
 * Only runs in production to avoid caching dev assets.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!import.meta.env.PROD) return
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silent — SW is a progressive enhancement */
      })
    }
    window.addEventListener("load", onLoad)
    return () => window.removeEventListener("load", onLoad)
  }, [])
  return null
}
