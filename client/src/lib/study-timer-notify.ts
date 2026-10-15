/**
 * Study-timer notification (native APK only).
 *
 * While a focus session is ACTIVE the app keeps a persistent (ongoing,
 * non-swipeable) notification in the shade showing the room and elapsed
 * time, with action buttons:
 *   - «توقف» stops the timer right from the shade (server clock truth).
 *   - tapping the body opens the study view.
 * Pausing keeps the (dismissible) notice; stopping/leaving clears it.
 * Text refreshes every 60s while the app lives; after a process kill the
 * next app open re-shows it from the live session (server is the truth).
 *
 * Test seam: pass a fake NotifyPlugin; production omits it and the real
 * plugin loads via dynamic import (stays out of the web chunk).
 */
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications"
import { apiFetch } from "@/lib/api-client"
import { isNativeApp } from "@/lib/native-notify"
import { useApp } from "@/lib/store"

type TimerPlugin = Pick<
  LocalNotificationsPlugin,
  "requestPermissions" | "schedule" | "cancel" | "registerActionTypes" | "addListener"
>

export const STUDY_TIMER_NOTIFICATION_ID = 21

export const STUDY_TIMER_SUMMARY_ID = 22

const ACTION_TYPE = "study-timer"

const ACTION_STOP = "study-stop"

interface TimerNotice {
  roomId: string
  roomName: string
  body: string
  ongoing: boolean
}

async function plugin(provided?: TimerPlugin): Promise<TimerPlugin | null> {
  try {
    if (!isNativeApp()) return null

    const active = provided ?? (await import("@capacitor/local-notifications")).LocalNotifications
    const perm = await active.requestPermissions()

    if (perm.display !== "granted") return null

    try {
      await active.registerActionTypes({
        types: [
          {
            id: ACTION_TYPE,
            actions: [
              { id: ACTION_STOP, title: "توقف تایمر", destructive: true },
              { id: "study-open", title: "باز کردن" },
            ],
          },
        ],
      })
    } catch {
      /* older plugin versions: actions unsupported, body tap still works */
    }

    return active
  } catch {
    return null
  }
}

/** Show or refresh the ongoing timer notice. Returns false off-native. */
export async function showTimerNotification(
  notice: TimerNotice,
  provided?: TimerPlugin,
): Promise<boolean> {
  const active = await plugin(provided)

  if (!active) return false

  try {
    await active.schedule({
      notifications: [
        {
          id: STUDY_TIMER_NOTIFICATION_ID,
          title: `در حال مطالعه — ${notice.roomName}`,
          body: notice.body,
          ongoing: notice.ongoing,
          autoCancel: false,
          actionTypeId: ACTION_TYPE,
          smallIcon: "ic_notification",
          schedule: { at: new Date(Date.now() + 1000) },
          extra: { roomId: notice.roomId },
        },
      ],
    })

    return true
  } catch {
    return false
  }
}

/** Remove the timer notice (stop/leave). Never throws. */
export async function clearTimerNotification(provided?: TimerPlugin): Promise<void> {
  try {
    if (!isNativeApp()) return

    const active = provided ?? (await import("@capacitor/local-notifications")).LocalNotifications

    await active.cancel({ notifications: [{ id: STUDY_TIMER_NOTIFICATION_ID }] })
  } catch {
    /* best-effort */
  }
}

/** Congratulatory summary after a stop. Never throws. */
export async function showTimerSummary(minutes: number, provided?: TimerPlugin): Promise<void> {
  try {
    if (!isNativeApp()) return

    const active = provided ?? (await import("@capacitor/local-notifications")).LocalNotifications
    const perm = await active.requestPermissions()

    if (perm.display !== "granted") return

    await active.schedule({
      notifications: [
        {
          id: STUDY_TIMER_SUMMARY_ID,
          title: "نشست مطالعه ثبت شد",
          body: `${minutes} دقیقه به امروزت اضافه شد.`,
          smallIcon: "ic_notification",
          schedule: { at: new Date(Date.now() + 1000) },
        },
      ],
    })
  } catch {
    /* best-effort */
  }
}

let actionsInstalled = false

/**
 * Global shade-action handler (call once from AppBootstrap): the «توقف»
 * button stops the live session even when the app sits in the background;
 * tapping the body opens the study view.
 */
export function installStudyTimerActions(): void {
  if (actionsInstalled || !isNativeApp()) return

  actionsInstalled = true

  void (async () => {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications")

      await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (event) => {
          const actionId = event.actionId

          if (actionId === ACTION_STOP) {
            void (async () => {
              try {
                await apiFetch("/api/study/session/stop", {
                  method: "POST",
                  body: JSON.stringify({}),
                })
              } catch {
                /* retry from the app itself */
              } finally {
                await clearTimerNotification()
              }
            })()
          } else {
            // Body/action tap: land exactly in that room (StudyView
            // consumes openRoomId once). Fall back to the overview.
            // SAFETY: extra is plugin JSON of our own making (see
            // showTimerNotification); garbage degrades to overview.
            const extra = event.notification?.extra as { roomId?: unknown } | undefined
            const roomId = String(extra?.roomId ?? "")

            if (roomId) useApp.getState().openStudyRoom(roomId)
            else useApp.getState().setView("study")
          }
        },
      )
    } catch {
      /* notifications unavailable — in-app controls remain */
    }
  })()
}
