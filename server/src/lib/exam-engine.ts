import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { db } from "./db.js"
import { answers, books, examSessions, modules, questions, users } from "./db/schema.js"
import { getAppState } from "./remote-config.js"
import { rateLimit } from "./auth/rate-limit.js"

/**
 * ExamEngine — deep module.
 * Owns: timer setup, question shuffling, answer recording, negative-marking
 * score computation, progress aggregation.
 *
 * Negative marking (Konkur-style): correct +3, wrong -1, skipped 0.
 * Score % = clamp(100 * (correct*3 - wrong) / (total*3), 0, 100).
 * When negative marking is off: correct +1, wrong 0 → percent = correct/total*100.
 */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface StartedExam {
  sessionId: string
  moduleId: string
  moduleTitle: string
  bookTitle: string
  totalQuestions: number
  durationSec: number
  negativeMarking: boolean
  questionOrder: string[]
  startedAt: string
}

export async function startExam(
  userId: string,
  moduleId: string,
  opts: { durationMin?: number; repeatQuestions?: boolean; practice?: boolean } = {},
): Promise<StartedExam> {
  const mod = await db.query.modules.findFirst({
    where: eq(modules.id, moduleId),
    with: { book: true, questions: { columns: { id: true } } },
  })
  if (!mod || !mod.book) throw new Error("MODULE_NOT_FOUND")

  const cfg = await getAppState()
  const isPractice = opts.practice ?? false
  const durationMin = opts.durationMin ?? cfg.defaultTimerMin
  const negativeMarking = isPractice ? false : cfg.negativeMarking
  const allowRepeat = opts.repeatQuestions ?? true

  let pool = mod.questions.map((q) => q.id)

  // When repeat is disabled, exclude questions the user has already answered
  // in any finished exam session for this module. If that leaves too few,
  // we fall back to the full pool (so the exam can still run).
  if (!allowRepeat && pool.length > 0) {
    const finishedIds = await db
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(
        and(
          eq(examSessions.userId, userId),
          eq(examSessions.moduleId, moduleId),
          eq(examSessions.status, "FINISHED"),
        ),
      )
      .all()
    const answered =
      finishedIds.length > 0
        ? await db
            .selectDistinct({ questionId: answers.questionId })
            .from(answers)
            .where(
              inArray(
                answers.sessionId,
                finishedIds.map((s) => s.id),
              ),
            )
            .all()
        : []
    const seen = new Set(answered.map((a) => a.questionId))
    const fresh = pool.filter((id) => !seen.has(id))
    if (fresh.length >= Math.min(3, pool.length)) {
      pool = fresh
    }
  }

  const questionOrder = shuffle(pool)

  const session = await db
    .insert(examSessions)
    .values({
      userId,
      moduleId,
      durationSec: durationMin * 60,
      totalQuestions: questionOrder.length,
      negativeMarking,
      isPractice,
      questionOrder: JSON.stringify(questionOrder),
    })
    .returning()
    .get()

  return {
    sessionId: session.id,
    moduleId: mod.id,
    moduleTitle: mod.title,
    bookTitle: mod.book.title,
    totalQuestions: questionOrder.length,
    durationSec: durationMin * 60,
    negativeMarking,
    questionOrder,
    startedAt: session.startedAt.toISOString(),
  }
}

/** Grace window (ms) after the deadline in which a final answer still lands —
 *  absorbs network latency; answering indefinitely is rejected server-side. */
const ANSWER_GRACE_MS = 5_000

export async function recordAnswer(
  sessionId: string,
  userId: string,
  questionId: string,
  selectedOption: number | null,
  timeSpentMs = 0,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const session = await db
    .select({
      id: examSessions.id,
      userId: examSessions.userId,
      moduleId: examSessions.moduleId,
      status: examSessions.status,
      startedAt: examSessions.startedAt,
      durationSec: examSessions.durationSec,
      isPractice: examSessions.isPractice,
      questionOrder: examSessions.questionOrder,
    })
    .from(examSessions)
    .where(eq(examSessions.id, sessionId))
    .get()
  if (!session || session.userId !== userId) return { ok: false, code: "NOT_FOUND" }
  if (session.status !== "IN_PROGRESS") return { ok: false, code: "NOT_IN_PROGRESS" }
  const questionIds: string[] = JSON.parse(session.questionOrder)
  if (!questionIds.includes(questionId)) return { ok: false, code: "QUESTION_NOT_FOUND" }

  // Write-rate guard: a scripted client can otherwise hammer upserts until the
  // deadline. 120 writes / session-minute is far above human pace.
  const rl = rateLimit(`answer:${sessionId}`, 120, 60)
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" }

  // Server-side timer: answers past startedAt+duration (+grace) are refused.
  // Practice sessions are untimed by design (the client hides the timer),
  // so the deadline never applies to them.
  if (!session.isPractice) {
    const deadline = session.startedAt.getTime() + session.durationSec * 1000
    if (Date.now() > deadline + ANSWER_GRACE_MS) {
      return { ok: false, code: "EXPIRED" }
    }
  }

  // Fetch the question directly and verify it belongs to this session's module.
  const question = await db
    .select({
      correctOption: questions.correctOption,
      moduleId: questions.moduleId,
      options: questions.options,
    })
    .from(questions)
    .where(eq(questions.id, questionId))
    .get()
  if (!question || question.moduleId !== session.moduleId) {
    return { ok: false, code: "QUESTION_NOT_FOUND" }
  }

  // Validate the option index against the question's real options range.
  let optionCount = question.options.length
  if (typeof question.options === "string") {
    try {
      optionCount = (JSON.parse(question.options) as unknown[]).length
    } catch {
      optionCount = 0
    }
  }
  if (selectedOption !== null && (selectedOption < 0 || selectedOption >= optionCount)) {
    return { ok: false, code: "INVALID_OPTION" }
  }

  const isCorrect =
    selectedOption === null ? null : selectedOption === question.correctOption

  // upsert answer (a user may change their answer before finishing)
  await db
    .insert(answers)
    .values({ sessionId, questionId, selectedOption, isCorrect, timeSpentMs })
    .onConflictDoUpdate({
      target: [answers.sessionId, answers.questionId],
      set: { selectedOption, isCorrect, timeSpentMs, answeredAt: new Date() },
    })
    .run()

  return { ok: true }
}

export interface FinishedExam {
  sessionId: string
  totalQuestions: number
  correctCount: number
  wrongCount: number
  skippedCount: number
  scorePercent: number
  negativeMarking: boolean
}

export async function finishExam(
  sessionId: string,
  userId: string,
): Promise<FinishedExam> {
  const session = await db.query.examSessions.findFirst({
    where: eq(examSessions.id, sessionId),
    with: { answers: true },
  })
  if (!session || session.userId !== userId) throw new Error("NOT_FOUND")
  if (session.status === "FINISHED") {
    return {
      sessionId: session.id,
      totalQuestions: session.totalQuestions,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      skippedCount: session.skippedCount,
      scorePercent: session.scorePercent,
      negativeMarking: session.negativeMarking,
    }
  }

  const correct = session.answers.filter((a) => a.isCorrect === true).length
  const wrong = session.answers.filter((a) => a.isCorrect === false).length
  const skipped = session.totalQuestions - correct - wrong

  const scorePercent = computeScore({
    correct,
    wrong,
    total: session.totalQuestions,
    negativeMarking: session.negativeMarking,
  })

  // Atomic transition IN_PROGRESS → FINISHED. The conditional updateMany makes
  // concurrent finishes (double-click + timer expiry) single-winner: exactly
  // one caller flips the status, so totalTests increments exactly once.
  const transition = await db
    .update(examSessions)
    .set({
      status: "FINISHED",
      finishedAt: new Date(),
      correctCount: correct,
      wrongCount: wrong,
      skippedCount: skipped,
      scorePercent,
    })
    .where(
      and(
        eq(examSessions.id, sessionId),
        eq(examSessions.userId, userId),
        eq(examSessions.status, "IN_PROGRESS"),
      ),
    )
    .run()

  if (transition.changes === 1) {
    await db
      .update(users)
      .set({ totalTests: sql`${users.totalTests} + 1` })
      .where(eq(users.id, userId))
      .run()
  } else {
    // Lost the race: a concurrent call already finalized this session.
    // Report its stored results instead of locally computed ones.
    const stored = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .get()
    if (stored && stored.status === "FINISHED") {
      return {
        sessionId: stored.id,
        totalQuestions: stored.totalQuestions,
        correctCount: stored.correctCount,
        wrongCount: stored.wrongCount,
        skippedCount: stored.skippedCount,
        scorePercent: stored.scorePercent,
        negativeMarking: stored.negativeMarking,
      }
    }
  }

  return {
    sessionId,
    totalQuestions: session.totalQuestions,
    correctCount: correct,
    wrongCount: wrong,
    skippedCount: skipped,
    scorePercent,
    negativeMarking: session.negativeMarking,
  }
}

export function computeScore(args: {
  correct: number
  wrong: number
  total: number
  negativeMarking: boolean
}): number {
  const { correct, wrong, total, negativeMarking } = args
  if (total <= 0) return 0
  let raw: number
  let max: number
  if (negativeMarking) {
    raw = correct * 3 - wrong * 1
    max = total * 3
  } else {
    raw = correct
    max = total
  }
  const pct = Math.round((raw / max) * 100)
  return Math.max(0, Math.min(100, pct))
}

/** Per-module progress for the report card. */
export interface ModuleProgress {
  moduleId: string
  moduleTitle: string
  bookTitle: string
  attempts: number
  lastScorePercent: number | null
  bestScorePercent: number | null
  lastFinishedAt: string | null
}

export async function getUserProgress(
  userId: string,
  field?: "FANI_HERFEI" | "KARDANESH",
): Promise<ModuleProgress[]> {
  // Shared books (field = null) belong to both fields' reports.
  const mods = await db
    .select({ id: modules.id, title: modules.title, bookTitle: books.title })
    .from(modules)
    .innerJoin(books, eq(modules.bookId, books.id))
    .where(field ? or(eq(books.field, field), isNull(books.field)) : undefined)
    .orderBy(asc(modules.order))
    .all()

  // Only what the report needs, folded in one pass — no per-module includes
  // that drag every finished session row into memory forever.
  const sessions = await db
    .select({
      moduleId: examSessions.moduleId,
      scorePercent: examSessions.scorePercent,
      finishedAt: examSessions.finishedAt,
    })
    .from(examSessions)
    .where(and(eq(examSessions.userId, userId), eq(examSessions.status, "FINISHED")))
    .orderBy(desc(examSessions.finishedAt))
    .all()

  const agg = new Map<
    string,
    { attempts: number; lastScore: number | null; lastAt: Date | null; best: number }
  >()
  for (const s of sessions) {
    let a = agg.get(s.moduleId)
    if (!a) {
      a = { attempts: 0, lastScore: null, lastAt: null, best: -1 }
      agg.set(s.moduleId, a)
    }
    a.attempts += 1
    if (!a.lastAt || (s.finishedAt && s.finishedAt > a.lastAt)) {
      a.lastScore = s.scorePercent
      a.lastAt = s.finishedAt
    }
    if (s.scorePercent > a.best) a.best = s.scorePercent
  }

  return mods.map((m) => {
    const a = agg.get(m.id)
    return {
      moduleId: m.id,
      moduleTitle: m.title,
      bookTitle: m.bookTitle,
      attempts: a?.attempts ?? 0,
      lastScorePercent: a?.lastScore ?? null,
      bestScorePercent: a && a.best >= 0 ? a.best : null,
      lastFinishedAt: a?.lastAt?.toISOString() ?? null,
    }
  })
}
