/**
 * Admin-broadcast inbox (web + native APK).
 *
 * On every boot the client asks for the latest active broadcast and shows
 * it exactly once per id (tracked in `pb-notif-seen`):
 *   - everywhere: an in-app toast with the same text,
 *   - APK: additionally a «پودمان‌بان» system notification.
 * The author never gets an echo of their own broadcast (they already saw
 * the send confirmation in the admin panel).
 * Failures are silent — announcements must never break boot.
 *
 * The optional `plugin` parameter is the test seam (real interface, no
 * module mocking): production omits it and the real plugin is loaded.
 */
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"
import type { NotifyPlugin } from "@/lib/welcome-notify"

// Same bridge detection as api-client (kept inline so @capacitor/core
// stays out of the web bundle).
function isNativeApp(): boolean {
  // SAFETY: DOM Window has no Capacitor bridge keys; the intersection only
  // narrows reads to optional props — no runtime shape is assumed.
  const w = window as Window & {
    androidBridge?: unknown
    webkit?: { messageHandlers?: { bridge?: unknown } }
  }

  return !!w.androidBridge || !!w.webkit?.messageHandlers?.bridge
}

export interface BroadcastNotification {
  id: string
  title: string
  body: string
  // Opaque author id (UUID) — only used to suppress the author's own echo.
  createdBy: string | null
  createdAt: string
}

const SEEN_KEY = "pb-notif-seen"

let inflight: Promise<void> | null = null

let watcher: ReturnType<typeof setInterval> | null = null

let watchingVisibility = false

let watchingOnline = false

export function showBroadcastOnce(plugin?: NotifyPlugin): Promise<void> {
  if (!inflight) {
    inflight = run(plugin).finally(() => {
      inflight = null
    })
  }

  return inflight
}

async function run(plugin?: NotifyPlugin): Promise<void> {
  try {
    const res = await apiFetch<{ notification: BroadcastNotification | null }>(
      "/api/notifications/latest",
    )

    const n = res.notification

    const id = n ? String(n.id) : ""

    if (!n || !id) return

    if (localStorage.getItem(SEEN_KEY) === id) return
    localStorage.setItem(SEEN_KEY, id)

    // Own broadcast: the author already got the send confirmation in the
    // admin panel — mark seen and stay silent instead of echoing it back.
    const me = useApp.getState().user?.id

    if (n.createdBy && n.createdBy === me) return

    // In-app toast — identical text on web and in the APK webview.
    toast({ title: n.title, description: n.body })

    if (!isNativeApp()) return

    // Dynamic import: the plugin stays out of the web chunk entirely.
    const active = plugin ?? (await import("@capacitor/local-notifications")).LocalNotifications
    const perm = await active.requestPermissions()

    if (perm.display !== "granted") return

    await active.schedule({
      notifications: [
        {
          id: 2,
          title: n.title,
          body: n.body,
          schedule: { at: new Date(Date.now() + 1000) },
          smallIcon: "ic_launcher",
        },
      ],
    })
  } catch {
    // Silent — see module doc.
  }
}

/**
 * Background watcher: re-checks for new admin broadcasts while the app is
 * open (every `intervalMs`), whenever the page becomes visible again
 * (returning from background on mobile), and when the device comes back
 * online. A broadcast created after boot therefore reaches open apps
 * without a restart — as an in-app toast everywhere and a system
 * notification in the APK. A fully closed app still needs FCM for push.
 *
 * Idempotent: calling it twice does not double-schedule. Returns a stop
 * function for cleanup. Failures stay silent by way of showBroadcastOnce.
 */
export function startBroadcastWatcher(intervalMs = 60000): () => void {
  if (!watcher) {
    watcher = setInterval(() => {
      void showBroadcastOnce()
    }, intervalMs)
  }

  if (!watchingVisibility) {
    watchingVisibility = true
    document.addEventListener("visibilitychange", recheckLatest)
  }

  if (!watchingOnline) {
    watchingOnline = true
    window.addEventListener("online", recheckLatest)
  }

  return stopBroadcastWatcher
}

export function stopBroadcastWatcher(): void {
  if (watcher) {
    clearInterval(watcher)
    watcher = null
  }

  if (watchingVisibility) {
    watchingVisibility = false
    document.removeEventListener("visibilitychange", recheckLatest)
  }

  if (watchingOnline) {
    watchingOnline = false
    window.removeEventListener("online", recheckLatest)
  }
}

function recheckLatest(): void {
  void showBroadcastOnce()
}
