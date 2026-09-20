/**
 * Nightly daily-goal reminder (23:00 Asia/Tehran).
 *
 * Shared hosts have no cron, so the client arms its own timer: at 23:00
 * Tehran, if the user answered fewer questions than their daily goal, they
 * get an in-app toast everywhere plus a system notification in the APK.
 * The admin kill-switch is RemoteConfig.dailyGoalNotify (super-admin).
 *
 * Exactly-once per Tehran day (localStorage), silent on failure, and the
 * timer re-arms itself so one boot covers every coming night.
 */
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"
import { parseExamPrefs, resolveDailyGoal } from "@/lib/exam-prefs"
import { ToPersianDigits } from "@/components/fa-utils"
import { isNativeApp, scheduleNativeNotification } from "@/lib/native-notify"
import type { NotifyPlugin } from "@/lib/native-notify"

const TEHRAN_TZ = "Asia/Tehran"

const REMIND_HOUR = 23

const FIRED_KEY_PREFIX = "pb-goal-reminded-"

const tehranDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TEHRAN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const tehranPartsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TEHRAN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

/** YYYY-MM-DD calendar day in Tehran. */
export function tehranDayKey(ms: number): string {
  return tehranDayFmt.format(new Date(ms))
}

/** IANA-zone offset (ms, east-positive) in effect at the given instant. */
function tehranOffsetMs(d: Date): number {
  const parts: Record<string, string> = {}

  for (const p of tehranPartsFmt.formatToParts(d)) parts[p.type] = p.value

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )

  return asUTC - d.getTime()
}

/** Absolute ms of the next 23:00 Tehran (today, or tomorrow if past). */
export function nextTehran23(nowMs: number): number {
  const off = tehranOffsetMs(new Date(nowMs))
  const wallNow = nowMs + off
  const dayStart = wallNow - (((wallNow % 86400000) + 86400000) % 86400000)

  let target = dayStart + REMIND_HOUR * 3600000 - off

  if (target <= nowMs) target += 86400000

  return target
}

let timer: ReturnType<typeof setTimeout> | null = null

let stopped = false

let firing: Promise<void> | null = null

export function startDailyGoalReminder(plugin?: NotifyPlugin): () => void {
  stopped = false
  arm(plugin)

  return stopDailyGoalReminder
}

export function stopDailyGoalReminder(): void {
  stopped = true

  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function arm(plugin?: NotifyPlugin): void {
  if (stopped) return

  // setTimeout overflows past ~24.8 days; the wait here is always < 24h,
  // but clamp anyway so a clock jump can never wedge the reminder.
  const wait = Math.min(Math.max(0, nextTehran23(Date.now()) - Date.now()), 2147483647)

  timer = setTimeout(() => {
    timer = null
    void fire(plugin)
  }, wait)
}

async function fire(plugin?: NotifyPlugin): Promise<void> {
  // One run per night even with overlapping timers (double start):
  // the second caller rides the first instead of double-toasting.
  if (firing) {
    await firing

    return
  }

  firing = runReminder(plugin)

  try {
    await firing
  } finally {
    firing = null
    arm(plugin)
  }
}

async function runReminder(plugin?: NotifyPlugin): Promise<void> {
  try {
    const state = useApp.getState()

    if (!state.config?.dailyGoalNotify) return

    const key = FIRED_KEY_PREFIX + tehranDayKey(Date.now())

    if (localStorage.getItem(key)) return

    const res = await apiFetch<{ todayAnswered: number }>("/api/user/daily-progress")
    const goal = resolveDailyGoal(parseExamPrefs(state.user?.prefs))

    if (res.todayAnswered >= goal) return
    localStorage.setItem(key, "1")

    const remaining = goal - res.todayAnswered

    toast({
      title: "هدف امروزت مونده!",
      description: `امروز ${ToPersianDigits(remaining)} سوال دیگه جواب بده تا به هدفت برسی.`,
    })

    if (!isNativeApp()) return

    await scheduleNativeNotification(plugin, {
      id: 3,
      title: "پودمان‌بان",
      body: `هنوز به هدف امروزت نرسیدی — ${ToPersianDigits(remaining)} سوال مونده!`,
      delayMs: 1000,
    })
  } catch {
    // Silent — a missed night is harmless; fire() re-arms below.
  }
}
