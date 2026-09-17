/**
 * Exam + book catalog routes.
 *
 * Endpoints:
 *   GET  /books                      — list books/modules for the user's field
 *   POST /exam/start                  — start a new exam session (CSRF)
 *   GET  /exam/:session               — get a running session + questions
 *   POST /exam/:session/answer       — record an answer (CSRF)
 *   POST /exam/:session/finish        — finish the session (CSRF)
 *   GET  /exam/:session/review        — review a finished session (with correct answers)
 *   POST /exam/:session/check         — practice-mode correct-answer peek (CSRF)
 *   GET  /exam/sessions               — finished-session history
 *   GET  /exam/progress               — per-module progress
 *   GET  /exam/stats                  — aggregate answer stats
 *   GET  /exam/in-progress            — latest IN_PROGRESS session
 *   GET  /exam/leaderboard            — top students
 */

import { Router } from "express"
import { z } from "zod"
import { and, avg, count, desc, eq, inArray, max } from "drizzle-orm"
import { db } from "../lib/db.js"
import { answers, books, examSessions, modules, questions, users } from "../lib/db/schema.js"
import {
  getSession,
  requireCsrf,
  rateLimit,
} from "../lib/auth/index.js"
import {
  startExam,
  recordAnswer,
  finishExam,
  getUserProgress,
} from "../lib/exam-engine.js"
import {
  listBooks,
  getQuestionsForExam,
  getQuestionsForReview,
} from "../lib/question-bank.js"
import {
  startExamSchema,
  answerSchema,
  parseBody,
} from "../lib/validations.js"

export const examRouter = Router()

// ---- GET /books ------------------------------------------------------

examRouter.get("/books", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const books = await listBooks(user.field)
  res.json({ books })
})

// ---- POST /exam/start (CSRF) -----------------------------------------

examRouter.post("/exam/start", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  // claude-red business-logic/DoS: each start inserts a session row.
  // 30 starts / 10min per user is far above human pace, blocks spam farms.
  const rl = rateLimit(`exam-start:${user.id}`, 30, 600)
  if (!rl.ok) {
    res.status(429).json({ error: "تعداد شروع آزمون بیش از حد مجاز است" })
    return
  }

  const data = parseBody(startExamSchema, req.body, res)
  if (!data) return
  const { moduleId, durationMin } = data
  const practice = data.practice ?? false

  // ensure module belongs to a book of the user's field (shared books allowed)
  const mod = await db.query.modules.findFirst({
    where: eq(modules.id, moduleId),
    with: { book: { columns: { field: true } } },
  })
  if (!mod || (mod.book.field !== null && mod.book.field !== user.field)) {
    res.status(403).json({ error: "این پودمان برای رشته شما در دسترس نیست" })
    return
  }

  // read the user's "repeatQuestions" preference (default true)
  let repeatQuestions = true
  try {
    const dbUser = await db
      .select({ prefs: users.prefs })
      .from(users)
      .where(eq(users.id, user.id))
      .get()
    if (dbUser?.prefs) {
      const prefs = JSON.parse(dbUser.prefs)
      if (typeof prefs.repeatQuestions === "boolean") {
        repeatQuestions = prefs.repeatQuestions
      }
    }
  } catch {
    /* ignore prefs errors */
  }

  const started = await startExam(user.id, moduleId, {
    durationMin,
    repeatQuestions,
    practice,
  })
  // Session metadata only. The full question set (with images) is fetched once
  // by GET /api/exam/:session when ExamView mounts — shipping it here too made
  // "start exam" transfer the whole bank twice.
  res.json({ session: started })
})

// ---- SPECIFIC /exam/* routes (must come before /exam/:session) ------

examRouter.get("/exam/sessions", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const rows = await db
    .select({
      id: examSessions.id,
      moduleId: examSessions.moduleId,
      scorePercent: examSessions.scorePercent,
      correctCount: examSessions.correctCount,
      wrongCount: examSessions.wrongCount,
      skippedCount: examSessions.skippedCount,
      totalQuestions: examSessions.totalQuestions,
      negativeMarking: examSessions.negativeMarking,
      startedAt: examSessions.startedAt,
      finishedAt: examSessions.finishedAt,
      moduleTitle: modules.title,
      bookTitle: books.title,
    })
    .from(examSessions)
    .innerJoin(modules, eq(examSessions.moduleId, modules.id))
    .innerJoin(books, eq(modules.bookId, books.id))
    .where(
      and(
        eq(examSessions.userId, user.id),
        eq(examSessions.status, "FINISHED"),
        eq(examSessions.isPractice, false),
      ),
    )
    .orderBy(desc(examSessions.finishedAt))
    .limit(50)
    .all()
  res.json({
    sessions: rows.map((s) => ({
      id: s.id,
      moduleId: s.moduleId,
      scorePercent: s.scorePercent,
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      skippedCount: s.skippedCount,
      totalQuestions: s.totalQuestions,
      negativeMarking: s.negativeMarking,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      moduleTitle: s.moduleTitle,
      bookTitle: s.bookTitle,
    })),
  })
})

examRouter.get("/exam/progress", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const progress = await getUserProgress(user.id, user.field)
  res.json({ progress })
})

examRouter.get("/exam/stats", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  const sessions = await db
    .select({
      correctCount: examSessions.correctCount,
      wrongCount: examSessions.wrongCount,
      skippedCount: examSessions.skippedCount,
      totalQuestions: examSessions.totalQuestions,
      bookTitle: books.title,
    })
    .from(examSessions)
    .innerJoin(modules, eq(examSessions.moduleId, modules.id))
    .innerJoin(books, eq(modules.bookId, books.id))
    .where(
      and(
        eq(examSessions.userId, user.id),
        eq(examSessions.status, "FINISHED"),
        eq(examSessions.isPractice, false),
      ),
    )
    .all()

  let totalCorrect = 0
  let totalWrong = 0
  let totalSkipped = 0
  let totalQuestions = 0

  const byBook = new Map<
    string,
    { correct: number; wrong: number; skipped: number }
  >()

  for (const s of sessions) {
    totalCorrect += s.correctCount
    totalWrong += s.wrongCount
    totalSkipped += s.skippedCount
    totalQuestions += s.totalQuestions
    const key = s.bookTitle
    const entry = byBook.get(key) ?? { correct: 0, wrong: 0, skipped: 0 }
    entry.correct += s.correctCount
    entry.wrong += s.wrongCount
    entry.skipped += s.skippedCount
    byBook.set(key, entry)
  }

  res.json({
    stats: {
      totalCorrect,
      totalWrong,
      totalSkipped,
      totalQuestions,
      totalSessions: sessions.length,
      byBook: Array.from(byBook.entries()).map(([book, v]) => ({
        book,
        ...v,
      })),
    },
  })
})

examRouter.get("/exam/in-progress", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const session = await db
    .select({
      id: examSessions.id,
      moduleId: examSessions.moduleId,
      startedAt: examSessions.startedAt,
      durationSec: examSessions.durationSec,
      totalQuestions: examSessions.totalQuestions,
      moduleTitle: modules.title,
      bookTitle: books.title,
    })
    .from(examSessions)
    .innerJoin(modules, eq(examSessions.moduleId, modules.id))
    .innerJoin(books, eq(modules.bookId, books.id))
    .where(and(eq(examSessions.userId, user.id), eq(examSessions.status, "IN_PROGRESS")))
    .orderBy(desc(examSessions.startedAt))
    .limit(1)
    .get()
  if (!session) {
    res.json({ session: null })
    return
  }
  res.json({
    session: {
      id: session.id,
      moduleId: session.moduleId,
      moduleTitle: session.moduleTitle,
      bookTitle: session.bookTitle,
      startedAt: session.startedAt.toISOString(),
      durationSec: session.durationSec,
      totalQuestions: session.totalQuestions,
    },
  })
})

examRouter.get("/exam/leaderboard", async (req, res) => {
  const me = await getSession(req)
  if (!me) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  // Aggregated per user in SQL — bounded by user count, not session count.
  const grouped = await db
    .select({
      userId: examSessions.userId,
      avgScore: avg(examSessions.scorePercent),
      bestScore: max(examSessions.scorePercent),
      n: count(),
    })
    .from(examSessions)
    .where(and(eq(examSessions.status, "FINISHED"), eq(examSessions.isPractice, false)))
    .groupBy(examSessions.userId)
    .all()

  const userRows =
    grouped.length > 0
      ? await db
          .select({ id: users.id, name: users.name, username: users.username, field: users.field })
          .from(users)
          .where(
            inArray(
              users.id,
              grouped.map((g) => g.userId),
            ),
          )
          .all()
      : []
  const userById = new Map(userRows.map((u) => [u.id, u]))

  const ranked = grouped
    .map((g) => {
      const u = userById.get(g.userId)
      if (!u) return null
      return {
        id: u.id,
        name: u.name,
        username: u.username,
        field: u.field as "FANI_HERFEI" | "KARDANESH",
        avg: Math.round(Number(g.avgScore ?? 0)),
        best: g.bestScore ?? 0,
        count: g.n,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.avg - a.avg || b.best - a.best)

  const top = ranked.slice(0, 50)
  const myRank = ranked.findIndex((r) => r.id === me.id) + 1
  const myEntry = ranked.find((r) => r.id === me.id) ?? null

  res.json({
    leaderboard: top.map((r, i) => ({ ...r, rank: i + 1 })),
    myRank: myRank || null,
    myStats: myEntry
      ? {
          avg: myEntry.avg,
          best: myEntry.best,
          count: myEntry.count,
        }
      : null,
    totalStudents: ranked.length,
  })
})

// ---- GET /exam/:session (running session) ---------------------------

examRouter.get("/exam/:session", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const sessionId = req.params.session

  const session = await db.query.examSessions.findFirst({
    where: eq(examSessions.id, sessionId),
    with: { module: { with: { book: { columns: { title: true } } } } },
  })
  if (!session) {
    res.status(404).json({ error: "نشست آزمون یافت نشد" })
    return
  }
  if (session.userId !== user.id) {
    res.status(403).json({ error: "دسترسی غیرمجاز" })
    return
  }

  const questionIds = JSON.parse(session.questionOrder) as string[]
  const questions = await getQuestionsForExam(session.moduleId, questionIds)

  // load existing answers so a reconnect resumes state
  const answerRows = await db
    .select({
      questionId: answers.questionId,
      selectedOption: answers.selectedOption,
      timeSpentMs: answers.timeSpentMs,
    })
    .from(answers)
    .where(eq(answers.sessionId, sessionId))
    .all()

  res.json({
    session: {
      id: session.id,
      moduleId: session.moduleId,
      moduleTitle: session.module.title,
      bookTitle: session.module.book.title,
      status: session.status,
      totalQuestions: session.totalQuestions,
      durationSec: session.durationSec,
      negativeMarking: session.negativeMarking,
      isPractice: session.isPractice,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() ?? null,
      scorePercent: session.scorePercent,
    },
    questions,
    answers: Object.fromEntries(answerRows.map((a) => [a.questionId, a])),
  })
})

// ---- POST /exam/:session/answer (CSRF) -------------------------------

examRouter.post("/exam/:session/answer", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  const sessionId = req.params.session
  const data = parseBody(answerSchema, req.body, res)
  if (!data) return
  const { questionId, selectedOption, timeSpentMs } = data

  const result = await recordAnswer(
    sessionId,
    user.id,
    questionId,
    selectedOption,
    timeSpentMs,
  )
  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === "QUESTION_NOT_FOUND") {
      res.status(404).json({ error: "یافت نشد" })
    } else if (result.code === "INVALID_OPTION") {
      res.status(422).json({ error: "گزینه انتخابی معتبر نیست" })
    } else {
      res.status(403).json({ error: "این آزمون دیگر فعال نیست" })
    }
    return
  }
  res.json({ ok: true })
})

// ---- POST /exam/:session/finish (CSRF) -------------------------------

examRouter.post("/exam/:session/finish", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  const sessionId = req.params.session
  try {
    const result = await finishExam(sessionId, user.id)
    res.json({ result })
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "یافت نشد" })
      return
    }
    res.status(500).json({ error: "خطا در پایان آزمون" })
  }
})

// ---- GET /exam/:session/review --------------------------------------

examRouter.get("/exam/:session/review", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const sessionId = req.params.session

  const session = await db.query.examSessions.findFirst({
    where: eq(examSessions.id, sessionId),
    with: { module: { with: { book: { columns: { title: true } } } } },
  })
  if (!session) {
    res.status(404).json({ error: "نشست آزمون یافت نشد" })
    return
  }
  if (session.userId !== user.id) {
    res.status(403).json({ error: "دسترسی غیرمجاز" })
    return
  }
  if (session.status !== "FINISHED") {
    res.status(403).json({ error: "بازبینی فقط برای آزمون‌های تمام‌شده امکان‌پذیر است" })
    return
  }

  const questionIds = JSON.parse(session.questionOrder) as string[]
  const questions = await getQuestionsForReview(session.moduleId, questionIds)

  const answerRows = await db
    .select({
      questionId: answers.questionId,
      selectedOption: answers.selectedOption,
      isCorrect: answers.isCorrect,
    })
    .from(answers)
    .where(eq(answers.sessionId, sessionId))
    .all()
  const answerMap = new Map(answerRows.map((a) => [a.questionId, a]))

  res.json({
    session: {
      id: session.id,
      moduleId: session.moduleId,
      moduleTitle: session.module.title,
      bookTitle: session.module.book.title,
      status: session.status,
      totalQuestions: session.totalQuestions,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      skippedCount: session.skippedCount,
      scorePercent: session.scorePercent,
      negativeMarking: session.negativeMarking,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() ?? null,
    },
    questions,
    answers: Object.fromEntries(answerMap.entries()),
  })
})

// ---- POST /exam/:session/check (CSRF — practice mode peek) ----------

const checkSchema = z.object({
  questionId: z.string().min(1),
})

examRouter.post("/exam/:session/check", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  const sessionId = req.params.session

  const session = await db
    .select({
      id: examSessions.id,
      userId: examSessions.userId,
      status: examSessions.status,
      isPractice: examSessions.isPractice,
      moduleId: examSessions.moduleId,
    })
    .from(examSessions)
    .where(eq(examSessions.id, sessionId))
    .get()
  if (!session) {
    res.status(404).json({ error: "نشست یافت نشد" })
    return
  }
  if (session.userId !== user.id) {
    res.status(403).json({ error: "دسترسی غیرمجاز" })
    return
  }
  if (!session.isPractice) {
    res.status(403).json({ error: "فقط در حالت تمرین قابل استفاده است" })
    return
  }
  if (session.status !== "IN_PROGRESS") {
    res.status(403).json({ error: "این آزمون فعال نیست" })
    return
  }

  const data = parseBody(checkSchema, req.body, res)
  if (!data) return
  const { questionId } = data

  const q = await db
    .select({
      correctOption: questions.correctOption,
      explanation: questions.explanation,
      moduleId: questions.moduleId,
    })
    .from(questions)
    .where(eq(questions.id, questionId))
    .get()
  if (!q || q.moduleId !== session.moduleId) {
    res.status(404).json({ error: "سوال یافت نشد" })
    return
  }

  res.json({
    correctOption: q.correctOption,
    explanation: q.explanation,
  })
})
