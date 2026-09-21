import { describe, it, expect } from "vitest"
import { firedThresholds } from "./exam-timer"

/**
 * Seam: countdown threshold policy (pure — no timers, no DOM).
 * Each threshold fires exactly once, on the tick that crosses it downward.
 */
describe("firedThresholds", () => {
  it("fires nothing on normal ticks", () => {
    expect(firedThresholds(900, 899)).toEqual([])
    expect(firedThresholds(61, 60.5)).toEqual([])
  })

  it("fires each threshold on its crossing tick", () => {
    expect(firedThresholds(301, 300)).toEqual([300])
    expect(firedThresholds(61, 60)).toEqual([60])
    expect(firedThresholds(31, 30)).toEqual([30])
    expect(firedThresholds(11, 10)).toEqual([10])
  })

  it("fires everything crossed by a big jump (backgrounded tab)", () => {
    expect(firedThresholds(400, 5)).toEqual([300, 60, 30, 10])
  })

  it("never refires below a threshold", () => {
    expect(firedThresholds(299, 298)).toEqual([])
    expect(firedThresholds(30, 29)).toEqual([])
  })
})
