import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act, cleanup } from "@testing-library/react"
import type {
  PermissionStatus,
  ScheduleOptions,
  ScheduleResult,
} from "@capacitor/local-notifications"
import type { PermissionState } from "@capacitor/core"
import { useToast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"
import type { AppUser } from "@/lib/store"
import { showBroadcastOnce, startBroadcastWatcher, stopBroadcastWatcher } from "./notify-inbox"
import type { BroadcastNotification } from "./notify-inbox"
import type { NotifyPlugin } from "./welcome-notify"

/**
 * Seam: admin broadcast inbox (real interfaces, no module mocking).
 * New id → in-app toast (+ native schedule in the APK), then remembered.
 * Same id / null / failure → silent.
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

/** Renders the real toast store so assertions read what the user would see. */
function ToastProbe() {
  const { toasts } = useToast()

  return (
    <div data-testid="probe">
      {toasts.flatMap((t) => (t.open ? [`${String(t.title)}|${String(t.description)}`] : [])).join("\n")}
    </div>
  )
}

/** Dismisses every toast left over by a previous test (real store, no mocks). */
function ClearToasts() {
  const { dismiss } = useToast()

  React.useEffect(() => {
    dismiss()
  }, [])

  return null
}

const fetchMock = vi.fn()

/** Puts a signed-in user (or nobody) into the real app store. */
function setUser(id: string | null): void {
  if (!id) {
    useApp.setState({ user: null })

    return
  }

  const user: AppUser = {
    id,
    name: "مدیر",
    username: "admin",
    field: "FANI_HERFEI",
    role: "ADMIN",
    totalTests: 0,
  }

  useApp.setState({ user })
}

function mockLatest(notification: BroadcastNotification | null): void {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ notification }),
  })
}

describe("showBroadcastOnce", () => {
  beforeEach(async () => {
    cleanup()
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    setAndroidBridge(false)
    setUser(null)

    await act(async () => {
      render(<ClearToasts />)
    })
    cleanup()
    render(<ToastProbe />)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setAndroidBridge(false)
    stopBroadcastWatcher()
  })

  it("new broadcast on web: toast with the admin text, remembered, no native call", async () => {
    mockLatest({ id: "n1", title: "آزمون فردا", body: "ساعت ۹", createdAt: "2026-01-01", createdBy: null })
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(fetchMock.mock.calls[0][0]).toBe("/api/notifications/latest")
    expect(screen.getByTestId("probe").textContent).toBe("آزمون فردا|ساعت ۹")
    expect(localStorage.getItem("pb-notif-seen")).toBe("n1")
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it("same id twice: toast only once", async () => {
    mockLatest({ id: "n1", title: "t", body: "b", createdAt: "2026-01-01", createdBy: null })
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("t|b")
  })

  it("null broadcast: silent", async () => {
    mockLatest(null)
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("")
  })

  it("native: toast plus one system notification", async () => {
    setAndroidBridge(true)
    mockLatest({ id: "n2", title: "اطلاعیه", body: "متن", createdAt: "2026-01-01", createdBy: null })
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("اطلاعیه|متن")
    expect(plugin.schedule).toHaveBeenCalledTimes(1)
  })

  it("fetch failure: silent, no throw", async () => {
    fetchMock.mockRejectedValue(new Error("offline"))
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("")
  })

  it("watcher: broadcast created after boot surfaces on the next tick", async () => {
    vi.useFakeTimers()
    mockLatest(null)

    await act(async () => {
      await showBroadcastOnce()
    })
    expect(screen.getByTestId("probe").textContent).toBe("")

    startBroadcastWatcher(60000)
    mockLatest({ id: "n9", title: "فوری", body: "خبر جدید", createdAt: "2026-01-02", createdBy: null })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(screen.getByTestId("probe").textContent).toBe("فوری|خبر جدید")
    expect(localStorage.getItem("pb-notif-seen")).toBe("n9")
  })

  it("watcher: returning to the page re-checks immediately", async () => {
    mockLatest({ id: "n8", title: "بازگشت", body: "دوباره خوش آمدی", createdAt: "2026-01-02", createdBy: null })
    startBroadcastWatcher(60000)

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await Promise.resolve()
    })

    expect(screen.getByTestId("probe").textContent).toBe("بازگشت|دوباره خوش آمدی")
  })

  it("own broadcast: the sender gets no echo toast (but it is marked seen)", async () => {
    setUser("u-admin")
    mockLatest({ id: "n5", title: "من", body: "پیام خودم", createdAt: "2026-01-02", createdBy: "u-admin" })
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("")
    expect(localStorage.getItem("pb-notif-seen")).toBe("n5")
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it("other sender broadcast: shown to the current user", async () => {
    setUser("u-admin")
    mockLatest({ id: "n6", title: "همکار", body: "پیام همکار", createdAt: "2026-01-02", createdBy: "u-other" })
    const plugin = makePlugin("granted")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("همکار|پیام همکار")
  })

  it("permission denied: toast still shows, no system notification", async () => {
    setAndroidBridge(true)
    mockLatest({ id: "n7", title: "عنوان", body: "متن", createdAt: "2026-01-02", createdBy: null })
    const plugin = makePlugin("denied")

    await act(async () => {
      await showBroadcastOnce(plugin)
    })

    expect(screen.getByTestId("probe").textContent).toBe("عنوان|متن")
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
})
