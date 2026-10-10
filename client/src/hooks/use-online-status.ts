/**
 * Real online status — navigator.onLine lies on phones.
 *
 * navigator.onLine only reflects the OS network interface (Wi-Fi associated,
 * radio up), not actual internet reachability: captive portals, Wi-Fi without
 * upstream, VPN/DNS stalls and radio handovers all report "online" while the
 * API is unreachable — or fire transient "offline" while connected. This hook
 * combines the OS signal with a cheap same-origin probe (GET /health, 8s
 * timeout), re-probed on window focus/online events and every 30s.
 *
 * States: true (verified), false (verified down), null (unknown yet).
 */
import * as React from "react"
import { API_BASE } from "@/lib/api-client"

/** Probe budget: fail fast so slow networks surface quickly. */
const PROBE_TIMEOUT_MS = 8000

async function probe(signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal,
    })

    return res.ok
  } catch {
    return false
  }
}

export function useOnlineStatus(): boolean | null {
  const [online, setOnline] = React.useState<boolean | null>(
    typeof navigator === "undefined" ? null : navigator.onLine ? null : false,
  )

  const onlineRef = React.useRef(online)
  onlineRef.current = online

  const check = React.useCallback(async () => {
    // OS says offline → trust it immediately (no radio, no point probing).
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false)

      return
    }

    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)

    try {
      setOnline(await probe(ctrl.signal))
    } finally {
      window.clearTimeout(timer)
    }
  }, [])

  React.useEffect(() => {
    void check()

    const onChange = () => {
      if (!navigator.onLine) setOnline(false)
      else void check()
    }

    const onFocus = () => {
      if (document.visibilityState === "visible") void check()
    }

    window.addEventListener("online", onChange)
    window.addEventListener("offline", onChange)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)

    const id = window.setInterval(() => {
      void check()
    }, 30000)

    return () => {
      window.removeEventListener("online", onChange)
      window.removeEventListener("offline", onChange)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
      window.clearInterval(id)
    }
  }, [check])

  return online
}
