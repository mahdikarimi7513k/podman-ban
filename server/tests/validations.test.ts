import { describe, it, expect } from "vitest"
import { answerSchema, questionCreateSchema } from "../src/lib/validations.js"

/**
 * Seam: zod schemas (public validation contracts).
 * Questions may carry 2..6 options, so an answer may target index 0..5.
 */
describe("answerSchema", () => {
  it("accepts option indices 0..5 (questions can have up to 6 options)", () => {
    for (const selectedOption of [0, 1, 2, 3, 4, 5]) {
      const parsed = answerSchema.safeParse({
        questionId: "q-1",
        selectedOption,
      })
      expect(parsed.success, `index ${selectedOption} should be valid`).toBe(true)
    }
  })

  it("accepts null (skip) and rejects out-of-range or non-integer values", () => {
    expect(
      answerSchema.safeParse({ questionId: "q-1", selectedOption: null }).success,
    ).toBe(true)
    expect(
      answerSchema.safeParse({ questionId: "q-1", selectedOption: 6 }).success,
    ).toBe(false)
    expect(
      answerSchema.safeParse({ questionId: "q-1", selectedOption: -1 }).success,
    ).toBe(false)
    expect(
      answerSchema.safeParse({ questionId: "q-1", selectedOption: 1.5 }).success,
    ).toBe(false)
    expect(answerSchema.safeParse({ questionId: "q-1" }).success).toBe(false)
  })
})

describe("questionCreateSchema", () => {
  it("allows 2..6 options", () => {
    expect(
      questionCreateSchema.safeParse({
        moduleId: "m",
        text: "متن",
        options: ["الف", "ب"],
        correctOption: 0,
      }).success,
    ).toBe(true)
    expect(
      questionCreateSchema.safeParse({
        moduleId: "m",
        text: "متن",
        options: ["۱", "۲", "۳", "۴", "۵", "۶"],
        correctOption: 5,
      }).success,
    ).toBe(true)
    expect(
      questionCreateSchema.safeParse({
        moduleId: "m",
        text: "متن",
        options: ["تنها یک"],
        correctOption: 0,
      }).success,
    ).toBe(false)
  })
})
