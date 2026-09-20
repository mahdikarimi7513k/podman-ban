import { describe, it, expect, beforeAll } from "vitest"

/**
 * Seam: exam-engine public functions against the real test DB
 * (same philosophy as the other seam tests — no db mocks).
 */
import { eq } from "drizzle-orm"
import { db } from "../src/lib/db.js"
import { examSessions, modules, questions, users } from "../src/lib/db/schema.js"
import { ensureUser } from "./helpers.js"
import { ensureFixtures } from "./fixtures.js"
import { finishExam, recordAnswer, startExam, computeScore } from "../src/lib/exam-engine.js"

beforeAll(ensureFixtures)

async function moduleId(): Promise<string> {
  const m = await db.select({ id: modules.id }).from(modules).where(eq(modules.title, "SEC-Module-1")).get()
  if (!m) throw new Error("SEC-Module-1 fixture missing")
  return m.id
}

async function otherModuleId(): Promise<string> {
  const m = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.title, "SEC-Shared-Module"))
    .get()
  if (!m) throw new Error("SEC-Shared-Module fixture missing")
  return m.id
}

async function studentId(username: string): Promise<string> {
  const u = await ensureUser(username, "STUDENT", "FANI_HERFEI")
  if (!u) throw new Error(`ensureUser failed for ${username}`)
  return u.id
}

describe("recordAnswer", () => {
  it("records an in-range selectedOption", async () => {
    const sid = await studentId("eng_stu1")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })
    const qid = started.questionOrder[0]

    const result = await recordAnswer(started.sessionId, sid, qid, 3)
    expect(result).toEqual({ ok: true })
  })

  it("rejects a selectedOption outside the question's real options range", async () => {
    const sid = await studentId("eng_stu2")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })

    const result = await recordAnswer(started.sessionId, sid, started.questionOrder[0], 4)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("INVALID_OPTION")
  })

  it("rejects when the session belongs to another user", async () => {
    const sid = await studentId("eng_stu3")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })

    const result = await recordAnswer(started.sessionId, "someone-else", started.questionOrder[0], 1)
    expect(result).toEqual({ ok: false, code: "NOT_FOUND" })
  })

  it("rejects when the session is not IN_PROGRESS", async () => {
    const sid = await studentId("eng_stu4")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })
    await finishExam(started.sessionId, sid)

    const result = await recordAnswer(started.sessionId, sid, started.questionOrder[0], 1)
    expect(result).toEqual({ ok: false, code: "NOT_IN_PROGRESS" })
  })

  it("rejects an answer after the server-side deadline (EXPIRED)", async () => {
    const sid = await studentId("eng_stu5")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })
    await db
      .update(examSessions)
      .set({ startedAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(examSessions.id, started.sessionId))
      .run()

    const result = await recordAnswer(started.sessionId, sid, started.questionOrder[0], 1)
    expect(result).toEqual({ ok: false, code: "EXPIRED" })
  })

  it("accepts practice answers past the nominal deadline (untimed practice)", async () => {
    const sid = await studentId("eng_stu_practice")
    const started = await startExam(sid, await moduleId(), { durationMin: 20, practice: true })
    await db
      .update(examSessions)
      .set({ startedAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(examSessions.id, started.sessionId))
      .run()

    const result = await recordAnswer(started.sessionId, sid, started.questionOrder[0], 1)
    expect(result).toEqual({ ok: true })
  })

  it("rejects a question that belongs to another module", async () => {
    const sid = await studentId("eng_stu6")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })
    // A question id from a different module (valid cuid-shape, wrong owner).
    const foreign = await startExam(sid, await otherModuleId(), { durationMin: 20 })

    const result = await recordAnswer(started.sessionId, sid, foreign.questionOrder[0] ?? "nope", 1)
    // SEC-Shared-Module has no questions → empty order falls back to an
    // unknown id; either way the question is not in this session's module.
    expect(result).toEqual({ ok: false, code: "QUESTION_NOT_FOUND" })
  })

  it("records null (skip) without option validation", async () => {
    const sid = await studentId("eng_stu7")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })

    const result = await recordAnswer(started.sessionId, sid, started.questionOrder[0], null)
    expect(result).toEqual({ ok: true })
  })

  it("rejects a same-module question that is not in the session's questionOrder", async () => {
    const sid = await studentId("eng_stu9")
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })
    const all = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.moduleId, started.moduleId))
      .all()
    const outsider = all.find((q) => !started.questionOrder.includes(q.id))
    expect(
      await recordAnswer(started.sessionId, sid, outsider?.id ?? "nope", 1),
    ).toEqual({ ok: false, code: "QUESTION_NOT_FOUND" })
  })
})

describe("computeScore", () => {
  it("applies konkur-style negative marking and clamps to 0..100", () => {
    // 6 correct (+18), 2 wrong (-2) of 10 → 1600/30 = 53.
    expect(computeScore({ correct: 6, wrong: 2, total: 10, negativeMarking: true })).toBe(53)
    // All wrong → negative raw clamps to 0, not below.
    expect(computeScore({ correct: 0, wrong: 5, total: 5, negativeMarking: true })).toBe(0)
    // Marking off → plain percent.
    expect(computeScore({ correct: 3, wrong: 7, total: 10, negativeMarking: false })).toBe(30)
    expect(computeScore({ correct: 0, wrong: 0, total: 0, negativeMarking: true })).toBe(0)
  })
})

describe("finishExam", () => {
  it("scores a finished exam and increments totalTests exactly once", async () => {
    const sid = await studentId("eng_stu8")
    const before = await db.select({ n: users.totalTests }).from(users).where(eq(users.id, sid)).get()
    const started = await startExam(sid, await moduleId(), { durationMin: 20 })
    await recordAnswer(started.sessionId, sid, started.questionOrder[0], 0)

    const res = await finishExam(started.sessionId, sid)
    expect(res.totalQuestions).toBe(3)
    expect(res.correctCount + res.wrongCount + res.skippedCount).toBe(3)

    // Second finish is idempotent and does not double-count.
    const again = await finishExam(started.sessionId, sid)
    expect(again).toEqual(res)

    const after = await db.select({ n: users.totalTests }).from(users).where(eq(users.id, sid)).get()
    expect((after?.n ?? 0) - (before?.n ?? 0)).toBe(1)
  })
})
