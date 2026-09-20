import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type {
  PermissionStatus,
  ScheduleOptions,
  ScheduleResult,
} from "@capacitor/local-notifications"
import type { PermissionState } from "@capacitor/core"
import { welcomeOnce, WELCOME_TITLE, WELCOME_BODY } from "./welcome-notify"
import type { NotifyPlugin } from "./welcome-notify"

/**
 * Seam: first-launch greeting (real plugin interface, no module mocking).
 * Web → silent no-op. APK → exactly one system notification, only when the
 * user grants permission. Denial or any failure never throws.
 */
function makePlugin(display: PermissionState): NotifyPlugin & {
  requestPermissions: ReturnType<typeof vi.fn>
  schedule: ReturnType<typeof vi.fn>
} {
  return {
    requestPermissions: vi.fn(async (): Promise<PermissionStatus> => ({ display })),
    schedule: vi.fn(async (_options: ScheduleOptions): Promise<ScheduleResult> => ({ notifications: [] })),
  }
}

function setAndroidBridge(on: boolean): void {
  // SAFETY: test-only bridge flag on the jsdom window; removed after each test.
  const w = window as Window & { androidBridge?: unknown }

  if (on) w.androidBridge = {}
  else delete w.androidBridge
}

describe("welcomeOnce", () => {
  beforeEach(() => {
    localStorage.clear()
    setAndroidBridge(false)
  })

  afterEach(() => {
    setAndroidBridge(false)
  })

  it("web: silent no-op (no permission prompt, no schedule)", async () => {
    const plugin = makePlugin("granted")

    await welcomeOnce(plugin)

    expect(plugin.requestPermissions).not.toHaveBeenCalled()
    expect(plugin.schedule).not.toHaveBeenCalled()
    expect(localStorage.getItem("pb-welcomed")).toBeNull()
  })

  it("native first launch: schedules exactly one پودمان‌بان greeting", async () => {
    setAndroidBridge(true)
    const plugin = makePlugin("granted")

    await welcomeOnce(plugin)

    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1)
    expect(plugin.schedule).toHaveBeenCalledTimes(1)
    expect(plugin.schedule.mock.calls[0][0]).toMatchObject({
      notifications: [{ title: WELCOME_TITLE, body: WELCOME_BODY }],
    })
    // Regression: ic_launcher lives in mipmap (adaptive) and can never be
    // a notification smallIcon — Android falls back to the default glyph.
    // The APK ships drawable/ic_notification for this (see workflow).
    expect(plugin.schedule.mock.calls[0][0].notifications[0].smallIcon).toBe(
      "ic_notification",
    )
    expect(localStorage.getItem("pb-welcomed")).toBe("1")
  })

  it("native second launch: never again", async () => {
    setAndroidBridge(true)
    const plugin = makePlugin("granted")

    await welcomeOnce(plugin)
    await welcomeOnce(plugin)

    expect(plugin.schedule).toHaveBeenCalledTimes(1)
  })

  it("permission denied: silent pass, no schedule, no throw", async () => {
    setAndroidBridge(true)
    const plugin = makePlugin("denied")

    await expect(welcomeOnce(plugin)).resolves.toBeUndefined()

    expect(plugin.schedule).not.toHaveBeenCalled()
  })
})
