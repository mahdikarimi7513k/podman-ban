import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act, cleanup } from "@testing-library/react"
import { useToast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"
import {
  nextTehran23,
  tehranDayKey,
  startDailyGoalReminder,
  stopDailyGoalReminder,
} from "./daily-goal-reminder"

/**
 * Seam: nightly goal reminder (real store + fetch stub, no module mocking).
 * Fires once per Tehran day at 23:00 only when the goal is unmet and the
 * admin switch is on; silent otherwise.
 */
const fetchMock = vi.fn()

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

function setConfigAndUser(notify: boolean, prefs: string): void {
  useApp.setState({
    config: {
      siteLocked: false,
      lockMessage: "",
      bannerText: "",
      bannerLink: "",
      bannerActive: false,
      defaultTimerMin: 20,
      negativeMarking: true,
      registrationOpen: true,
      registrationMessage: "",
      externalApiEnabled: false,
      externalApiKeyPrefix: "",
      dailyGoalNotify: notify,
    },
    user: {
      id: "u1",
      name: "کاربر",
      username: "user1",
      field: "FANI_HERFEI",
      role: "STUDENT",
      totalTests: 0,
      prefs,
    },
  })
}

function tehranWall(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms))
}

describe("nextTehran23", () => {
  it("lands on 23:00 Tehran wall clock, in the future", () => {
    const now = Date.now()
    const target = nextTehran23(now)

    expect(target).toBeGreaterThan(now)
    expect(target - now).toBeLessThanOrEqual(86400000)
    expect(tehranWall(target)).toBe("23:00")
  })

  it("tonight when before 23:00 (Tehran 22:00 → 60 minutes)", () => {
    // 2026-01-01 22:00 Tehran = 18:30 UTC (no DST).
    const now = Date.UTC(2026, 0, 1, 18, 30, 0)
    const target = nextTehran23(now)

    expect(target - now).toBe(3600000)
    expect(tehranDayKey(target)).toBe(tehranDayKey(now))
  })

  it("tomorrow night when past 23:00 (Tehran 23:30 → 23.5 hours)", () => {
    const now = Date.UTC(2026, 0, 1, 20, 0, 0)
    const target = nextTehran23(now)

    expect(target - now).toBe(23.5 * 3600000)
  })
})

describe("startDailyGoalReminder", () => {
  beforeEach(async () => {
    cleanup()
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.useFakeTimers()
    setConfigAndUser(true, '{"dailyGoal":20}')

    await act(async () => {
      render(<ClearToasts />)
    })
    cleanup()
    render(<ToastProbe />)
  })

  afterEach(() => {
    stopDailyGoalReminder()
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    useApp.setState({ user: null, config: null })
  })

  it("reminds at 23:00 when the goal is unmet", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ todayAnswered: 5, date: "2026-01-01" }),
    })
    startDailyGoalReminder()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600000)
    })

    const text = screen.getByTestId("probe").textContent ?? ""
    expect(text).toContain("هدف امروزت مونده!")
    expect(localStorage.getItem("pb-goal-reminded-" + tehranDayKey(Date.now()))).toBe("1")
  })

  it("stays silent when the goal is already met", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ todayAnswered: 25, date: "2026-01-01" }),
    })
    startDailyGoalReminder()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600000)
    })

    expect(screen.getByTestId("probe").textContent).toBe("")
  })

  it("stays silent when the admin switch is off", async () => {
    setConfigAndUser(false, '{"dailyGoal":20}')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ todayAnswered: 0, date: "2026-01-01" }),
    })
    startDailyGoalReminder()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600000)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId("probe").textContent).toBe("")
  })

  it("double start still reminds only once per night (StrictMode-safe)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ todayAnswered: 0, date: "2026-01-01" }),
    })
    startDailyGoalReminder()
    startDailyGoalReminder()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600000)
    })

    expect(screen.getByTestId("probe").textContent).toBe(
      "هدف امروزت مونده!|امروز ۲۰ سوال دیگه جواب بده تا به هدفت برسی.",
    )
  })
})
