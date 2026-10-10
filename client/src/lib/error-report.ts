/**
 * Client error reporting — global capture + throttled delivery.
 *
 * Captures window error / unhandledrejection and POSTs to /api/client-logs
 * (server persists to logs/client-*.log). Best-effort: never throws, never
 * loops (failures are swallowed), at most 5 reports per boot.
 */

import { API_BASE } from "@/lib/api-client"

/** JSON-safe primitives only — the server caps and truncates these. */
type ClientLogMeta = { [key: string]: string | number | boolean | null | undefined }

type ClientLogLevel = "warn" | "error"

const MAX_REPORTS_PER_BOOT = 5

let sent = 0

let installed = false

function deliver(level: ClientLogLevel, message: string, meta?: ClientLogMeta): void {
  if (sent >= MAX_REPORTS_PER_BOOT) return

  sent++

  try {
    const body = JSON.stringify({ source: "web", level, message: message.slice(0, 500), meta })

    // sendBeacon survives pagehide/kill; fetch fallback keeps cookies.
    // Existence probe (not a value check): old WebViews may lack sendBeacon.
    if (typeof navigator.sendBeacon !== "undefined") {
      const blob = new Blob([body], { type: "application/json" })

      if (navigator.sendBeacon(`${API_BASE}/api/client-logs`, blob)) return
    }

    void fetch(`${API_BASE}/api/client-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body,
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    })
  } catch {
    /* reporting must never crash the app */
  }
}

export function reportClientError(message: string, meta?: ClientLogMeta): void {
  deliver("error", message, meta)
}

/** Install once at boot (AppBootstrap). Safe to call repeatedly. */
export function installErrorReporting(): void {
  if (installed) return

  // Existence probe: this module only runs in browsers, but the guard keeps
  // SSR/test imports from touching window at module scope.
  if (typeof window === "undefined") return

  installed = true

  window.addEventListener("error", (e) => {
    const msg = e.message || "window.onerror"

    deliver("error", msg, {
      file: e.filename.slice(-120),
      line: e.lineno,
      col: e.colno,
    })
  })

  window.addEventListener("unhandledrejection", (e) => {
    const reason: unknown = e.reason
    const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason).slice(0, 300)

    deliver("error", `unhandledrejection: ${msg}`)
  })
}
