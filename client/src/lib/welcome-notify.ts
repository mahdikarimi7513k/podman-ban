/**
 * First-launch welcome notification (native APK only).
 *
 * - Web (the plain site): no-op — the in-app toast covers it.
 * - APK: shows a «پودمان‌بان» system notification once, 3s after first
 *   launch. The `pb-welcomed` flag in the WebView storage guarantees
 *   exactly-once; permission denial is silently ignored (no error, no crash).
 *
 * The optional `plugin` parameter is the test seam (real interface, no
 * module mocking): production omits it and the real plugin is loaded.
 */
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications"

export type NotifyPlugin = Pick<LocalNotificationsPlugin, "requestPermissions" | "schedule">

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

const SEEN_KEY = "pb-welcomed"

export const WELCOME_TITLE = "پودمان‌بان"

export const WELCOME_BODY = "به پودمان‌بان خوش آمدی! آزمونت را از همین‌جا شروع کن."

export async function welcomeOnce(plugin?: NotifyPlugin): Promise<void> {
  try {
    // Browser / plain site → nothing to do.
    if (!isNativeApp()) return

    // Already welcomed → never again.
    if (localStorage.getItem(SEEN_KEY)) return
    localStorage.setItem(SEEN_KEY, "1")

    // Dynamic import: the plugin stays out of the web chunk entirely.
    const active = plugin ?? (await import("@capacitor/local-notifications")).LocalNotifications

    // Android 13+ requires an explicit opt-in; denial is a silent pass.
    const perm = await active.requestPermissions()

    if (perm.display !== "granted") return

    await active.schedule({
      notifications: [
        {
          id: 1,
          title: WELCOME_TITLE,
          body: WELCOME_BODY,
          // 3s after entry — feels like «a message from the app», not boot noise.
          schedule: { at: new Date(Date.now() + 3000) },
          smallIcon: "ic_notification",
        },
      ],
    })
  } catch {
    // Progressive enhancement — notification failure must never break boot.
  }
}
