/**
 * Study-timer notification seam: ongoing shade notice with actions,
 * driven through a fake plugin (no native bridge in tests).
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  showTimerNotification,
  clearTimerNotification,
  showTimerSummary,
  STUDY_TIMER_NOTIFICATION_ID,
} from "@/lib/study-timer-notify"

interface Scheduled {
  id: number
  title: string
  body: string
  ongoing?: boolean
  autoCancel?: boolean
  actionTypeId?: string
  smallIcon?: string
  schedule?: { at: Date }
  extra?: { roomId: string }
}

function fakePlugin() {
  const scheduled: Scheduled[] = []
  const cancelled: number[] = []
  const actionTypes: unknown[] = []

  return {
    scheduled,
    cancelled,
    actionTypes,
    plugin: {
      requestPermissions: async () => ({ display: "granted" as const }),
      schedule: async (args: { notifications: Scheduled[] }) => {
        scheduled.push(...args.notifications)

        return { notifications: [] }
      },
      cancel: async (args: { notifications: Array<{ id: number }> }) => {
        cancelled.push(...args.notifications.map((n) => n.id))
      },
      registerActionTypes: async (args: { types: unknown[] }) => {
        actionTypes.push(...args.types)
      },
      addListener: async () => ({ remove: async () => {} }),
    },
  }
}

function asNative() {
  Object.defineProperty(window, "androidBridge", { value: {}, configurable: true })
}

beforeEach(() => {
  Object.defineProperty(window, "androidBridge", { value: undefined, configurable: true })
})

describe("study-timer-notify", () => {
  it("is a no-op off-native", async () => {
    const f = fakePlugin()

    expect(await showTimerNotification({ roomId: "r", roomName: "n", body: "b", ongoing: true }, f.plugin)).toBe(false)
    expect(f.scheduled).toHaveLength(0)
  })

  it("schedules an ongoing actionable notice on native", async () => {
    asNative()
    const f = fakePlugin()

    expect(
      await showTimerNotification({ roomId: "r1", roomName: "ققنوس", body: "۱۰ دقیقه", ongoing: true }, f.plugin),
    ).toBe(true)
    expect(f.scheduled).toHaveLength(1)

    const n = f.scheduled[0]

    expect(n?.id).toBe(STUDY_TIMER_NOTIFICATION_ID)
    expect(n?.ongoing).toBe(true)
    expect(n?.autoCancel).toBe(false)
    expect(n?.actionTypeId).toBe("study-timer")
    expect(n?.extra).toEqual({ roomId: "r1" })
    expect(f.actionTypes).toHaveLength(1)
  })

  it("clears and summarizes", async () => {
    asNative()
    const f = fakePlugin()

    await clearTimerNotification(f.plugin)
    expect(f.cancelled).toContain(STUDY_TIMER_NOTIFICATION_ID)

    await showTimerSummary(65, f.plugin)
    expect(f.scheduled).toHaveLength(1)
    expect(f.scheduled[0]?.body).toContain("65")
  })
})
