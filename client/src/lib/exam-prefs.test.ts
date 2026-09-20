import { describe, it, expect } from "vitest"
import {
  parseExamPrefs,
  resolveExamDurationMin,
  resolveDailyGoal,
  FALLBACK_DURATION_MIN,
  FALLBACK_DAILY_GOAL,
} from "./exam-prefs"

/**
 * Seam: preference resolution for the exam start defaults.
 * User pref wins, then the admin default, then the hard fallback —
 * corrupt prefs never break exam start.
 */
describe("parseExamPrefs", () => {
  it("parses valid prefs", () => {
    expect(parseExamPrefs('{"examDurationMin":30,"dailyGoal":50}')).toEqual({
      examDurationMin: 30,
      dailyGoal: 50,
    })
  })

  it("returns empty for missing/corrupt/non-object prefs", () => {
    expect(parseExamPrefs(undefined)).toEqual({})
    expect(parseExamPrefs("")).toEqual({})
    expect(parseExamPrefs("not-json")).toEqual({})
    expect(parseExamPrefs("[1,2]")).toEqual({})
    expect(parseExamPrefs('{"examDurationMin":"30"}')).toEqual({})
  })
})

describe("resolveExamDurationMin", () => {
  it("prefers the user pref", () => {
    expect(resolveExamDurationMin({ examDurationMin: 45 }, 10)).toBe(45)
  })

  it("falls back to the admin default", () => {
    expect(resolveExamDurationMin({}, 30)).toBe(30)
  })

  it("falls back to 20 when both are missing or out of range", () => {
    expect(resolveExamDurationMin({}, undefined)).toBe(FALLBACK_DURATION_MIN)
    expect(resolveExamDurationMin({ examDurationMin: 0 }, 500)).toBe(FALLBACK_DURATION_MIN)
    expect(resolveExamDurationMin({ examDurationMin: 20.5 }, 10.5)).toBe(FALLBACK_DURATION_MIN)
  })
})

describe("resolveDailyGoal", () => {
  it("uses a valid user goal", () => {
    expect(resolveDailyGoal({ dailyGoal: 50 })).toBe(50)
  })

  it("falls back to 20 otherwise", () => {
    expect(resolveDailyGoal({})).toBe(FALLBACK_DAILY_GOAL)
    expect(resolveDailyGoal({ dailyGoal: 3 })).toBe(FALLBACK_DAILY_GOAL)
    expect(resolveDailyGoal({ dailyGoal: 500 })).toBe(FALLBACK_DAILY_GOAL)
  })
})
