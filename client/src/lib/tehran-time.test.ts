/**
 * Tehran wall-clock: identical output regardless of device timezone.
 */
import { describe, it, expect } from "vitest"
import { formatTehran, TEHRAN_TZ } from "@/lib/tehran-time"

describe("formatTehran", () => {
  it("exposes the Tehran zone", () => {
    expect(TEHRAN_TZ).toBe("Asia/Tehran")
  })

  it("renders a known UTC instant as Tehran time", () => {
    // 12:00 UTC = 15:30 Tehran (UTC+3:30, no DST since 2022).
    expect(formatTehran("2026-10-10T12:00:00.000Z", { hour: "2-digit", minute: "2-digit" })).toBe("۱۵:۳۰")
  })

  it("never throws on garbage", () => {
    expect(formatTehran("not-a-date", { hour: "2-digit", minute: "2-digit" })).toBe("")
  })
})
