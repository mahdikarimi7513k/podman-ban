/**
 * Native notification plumbing (Capacitor LocalNotifications).
 *
 * Test seam: pass a fake `NotifyPlugin` in tests; production omits it and
 * the real plugin is loaded via dynamic import (stays out of the web chunk).
 */
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications"

export type NotifyPlugin = Pick<LocalNotificationsPlugin, "requestPermissions" | "schedule">

/** Display permission state for notification flows. */
export type NotifyPermission = "granted" | "denied" | "unavailable"

/**
 * Ask for the system notification permission (native APK only) and report
 * the outcome. "denied" means the user blocked it — the only path left is
 * manual: phone Settings → Apps → PodmanBan → Notifications. There is no
 * settings deep-link without an extra native plugin, so callers show the
 * manual steps instead of retrying blindly.
 */
export async function ensureNotificationPermission(
  plugin?: NotifyPlugin,
): Promise<NotifyPermission> {
  try {
    if (!isNativeApp()) return "unavailable"

    const active = plugin ?? (await import("@capacitor/local-notifications")).LocalNotifications
    const perm = await active.requestPermissions()

    return perm.display === "granted" ? "granted" : "denied"
  } catch {
    return "unavailable"
  }
}

/**
 * Short haptic tick. Best-effort: guarded for SSR and silent where the
 * Vibration API is missing (iOS Safari, desktop) — never breaks UI.
 */
export function haptic(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    /* never break UI for a buzz */
  }
}

// Same bridge detection as api-client (kept inline so @capacitor/core
// stays out of the web bundle).
export function isNativeApp(): boolean {
  // SAFETY: DOM Window has no Capacitor bridge keys; the intersection only
  // narrows reads to optional props — no runtime shape is assumed.
  const w = window as Window & {
    androidBridge?: unknown
    webkit?: { messageHandlers?: { bridge?: unknown } }
  }

  return !!w.androidBridge || !!w.webkit?.messageHandlers?.bridge
}

export interface NativeNotification {
  id: number
  title: string
  body: string
  /** ms from now (Android exactness is best-effort without the alarm permission). */
  delayMs: number
}

/**
 * Show a «پودمان‌بان» system notification (native APK only).
 * Returns true when it was scheduled. Never throws — callers decide
 * whether the in-app toast (which always works) suffices.
 */
export async function scheduleNativeNotification(
  plugin: NotifyPlugin | undefined,
  note: NativeNotification,
): Promise<boolean> {
  try {
    if (!isNativeApp()) return false

    // Dynamic import: the plugin stays out of the web chunk entirely.
    const active = plugin ?? (await import("@capacitor/local-notifications")).LocalNotifications
    const perm = await active.requestPermissions()

    if (perm.display !== "granted") return false

    await active.schedule({
      notifications: [
        {
          id: note.id,
          title: note.title,
          body: note.body,
          schedule: { at: new Date(Date.now() + note.delayMs) },
          smallIcon: "ic_notification",
        },
      ],
    })

    return true
  } catch {
    return false
  }
}
