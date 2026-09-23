/**
 * User self-service routes.
 *
 * Endpoints:
 *   PUT /prefs          — update preferences JSON (CSRF)
 *   PUT /password       — change password (CSRF)
 *   GET /achievements   — unlocked + locked achievements
 *   GET /daily-progress — today's answered-questions count
 *   GET /heatmap         — last 7/30 days answer counts (?range=7|30)
 */

import { Router } from "express"
import { z } from "zod"
import { and, eq, gte, inArray, isNull } from "drizzle-orm"
import { db } from "../lib/db.js"
import { answers, examSessions, refreshTokens, users } from "../lib/db/schema.js"
import {
  getSession,
  requireCsrf,
  rateLimit,
  clientIp,
  socketIp,
} from "../lib/auth/index.js"
import {
  hashPassword,
  verifyPassword,
  logout,
} from "../lib/auth/index.js"
import { prefsSchema, parseBody } from "../lib/validations.js"

export const userRouter = Router()

// ---- Tehran calendar-day helpers --------------------------------------
// The server timezone is arbitrary (shared host), so every "day" boundary
// (streak, daily goal, heatmap) follows Asia/Tehran. en-CA formats as
// YYYY-MM-DD — lexicographically sortable and directly comparable.
const TEHRAN_TZ = "Asia/Tehran"

const tehranDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TEHRAN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Calendar-day key (YYYY-MM-DD) in Tehran for an instant. */
function tehranDayKey(d: Date): string {
  return tehranDayFmt.format(d)
}

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

/** UTC ms of Tehran 00:00 for the Tehran calendar day containing `nowMs`. */
function tehranDayStartMs(nowMs: number): number {
  const [y, m, d] = tehranDayKey(new Date(nowMs)).split("-").map(Number)
  // Measure the offset at UTC noon — always the same Tehran calendar day
  // (UTC+3:30 → 15:30 local), so a midnight DST jump can't skew the result.
  const off = tehranOffsetMs(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))

  return Date.UTC(y, m - 1, d, 0, 0, 0) - off
}

// ---- PUT /prefs (CSRF) ----------------------------------------------

userRouter.put("/prefs", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  const data = parseBody(prefsSchema, req.body, res)
  if (!data) return

  const dbUser = await db
    .select({ prefs: users.prefs })
    .from(users)
    .where(eq(users.id, user.id))
    .get()
  if (!dbUser) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const current = JSON.parse(dbUser.prefs || "{}")
  const next = { ...current, ...data }
  await db.update(users).set({ prefs: JSON.stringify(next) }).where(eq(users.id, user.id)).run()
  res.json({ prefs: next })
})

// ---- PUT /password (CSRF) --------------------------------------------

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "رمز عبور فعلی را وارد کنید"),
  newPassword: z
    .string()
    .min(8, "رمز عبور حداقل ۸ کاراکتر باشد")
    .max(72, "رمز عبور حداکثر ۷۲ کاراکتر باشد")
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
      message: "رمز عبور باید شامل حرف و عدد باشد",
    }),
})

userRouter.put("/password", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  // A stolen session must not grant unlimited guesses at the current
  // password: changing it is rare, so the quota is tight (5/5min per
  // account, with IP + socket floors like the login hardening).
  const ip = clientIp(req)
  const sip = socketIp(req)
  const rlSelf = rateLimit(`pwd-u:${user.id}`, 5, 300)
  const rlIp = rateLimit(`pwd-ip:${ip}`, 20, 300)
  const rlSock = rateLimit(`pwd-ip-sock:${sip}`, 300, 300)

  if (!rlSelf.ok || !rlIp.ok || !rlSock.ok) {
    res.status(429).json({
      error: "تلاش‌های بیش از حد",
      retryAfterSec: Math.max(rlSelf.retryAfterSec, rlIp.retryAfterSec, rlSock.retryAfterSec),
    })

    return
  }

  const data = parseBody(passwordChangeSchema, req.body, res)
  if (!data) return
  const { currentPassword, newPassword } = data

  const dbUser = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .get()
  if (!dbUser) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  const valid = await verifyPassword(currentPassword, dbUser.passwordHash)
  if (!valid) {
    res.status(422).json({ error: "رمز عبور فعلی نادرست است" })
    return
  }

  if (currentPassword === newPassword) {
    res.status(422).json({ error: "رمز عبور جدید نباید با رمز فعلی یکسان باشد" })
    return
  }

  const newHash = await hashPassword(newPassword)
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id)).run()

  // A password change must kill every existing session — stolen refresh
  // families would otherwise survive up to their full 30-day lifetime.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)))
    .run()
  // Drop this device's cookies too (logout clears them with matching opts);
  // the client sends the user to re-login.
  await logout(req, res)

  res.json({ ok: true })
})

// ---- GET /achievements ------------------------------------------------

interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  progress?: { current: number; target: number }
}

userRouter.get("/achievements", async (req, res) => {
  const me = await getSession(req)
  if (!me) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  const sessions = await db
    .select({
      id: examSessions.id,
      scorePercent: examSessions.scorePercent,
      correctCount: examSessions.correctCount,
      wrongCount: examSessions.wrongCount,
      skippedCount: examSessions.skippedCount,
      totalQuestions: examSessions.totalQuestions,
      finishedAt: examSessions.finishedAt,
    })
    .from(examSessions)
    .where(and(eq(examSessions.userId, me.id), eq(examSessions.status, "FINISHED")))
    .all()

  const totalExams = sessions.length
  const totalQuestions = sessions.reduce((a, s) => a + s.totalQuestions, 0)
  const totalCorrect = sessions.reduce((a, s) => a + s.correctCount, 0)
  const bestScore = sessions.reduce((a, s) => Math.max(a, s.scorePercent), 0)
  const perfectScores = sessions.filter((s) => s.scorePercent >= 90).length

  // streak: consecutive Tehran days with at least one finished exam (today backwards)
  const days = new Set<string>()

  for (const s of sessions) {
    if (s.finishedAt) {
      days.add(tehranDayKey(s.finishedAt))
    }
  }

  let streak = 0
  // Fixed 24h steps are exact while Tehran has no DST (none since 2022);
  // the formatter keys keep each boundary correct regardless.
  const streakStartMs = tehranDayStartMs(Date.now())

  for (let i = 0; i < 365; i++) {
    const key = tehranDayKey(new Date(streakStartMs - i * 86400000))

    if (days.has(key)) streak++
    else if (i > 0) break // allow today to be empty
  }

  const achievements: Achievement[] = [
    {
      id: "first_exam",
      title: "اولین قدم",
      description: "اولین آزمون خود را به پایان برسانید",
      icon: "Footprints",
      unlocked: totalExams >= 1,
    },
    {
      id: "streak_3",
      title: "پشت‌سرهم",
      description: "۳ روز پیاپی آزمون بدهید",
      icon: "Flame",
      unlocked: streak >= 3,
      progress: { current: streak, target: 3 },
    },
    {
      id: "streak_7",
      title: "هفته‌ی پرکار",
      description: "۷ روز پیاپی آزمون بدهید",
      icon: "Flame",
      unlocked: streak >= 7,
      progress: { current: streak, target: 7 },
    },
    {
      id: "exams_10",
      title: "ده‌تای کامل",
      description: "۱۰ آزمون به پایان برسانید",
      icon: "Target",
      unlocked: totalExams >= 10,
      progress: { current: totalExams, target: 10 },
    },
    {
      id: "questions_100",
      title: "صد سوال",
      description: "به ۱۰۰ سوال پاسخ دهید",
      icon: "FileQuestion",
      unlocked: totalQuestions >= 100,
      progress: { current: totalQuestions, target: 100 },
    },
    {
      id: "perfect_score",
      title: "نمره‌ی عالی",
      description: "یک آزمون با درصد ۹۰+ بزنید",
      icon: "Star",
      unlocked: perfectScores >= 1,
      progress: { current: perfectScores, target: 1 },
    },
    {
      id: "exams_50",
      title: "نیم‌تنه",
      description: "۵۰ آزمون به پایان برسانید",
      icon: "Trophy",
      unlocked: totalExams >= 50,
      progress: { current: totalExams, target: 50 },
    },
    {
      id: "questions_500",
      title: "استاد سوال‌ها",
      description: "به ۵۰۰ سوال پاسخ دهید",
      icon: "Brain",
      unlocked: totalQuestions >= 500,
      progress: { current: totalQuestions, target: 500 },
    },
  ]

  const unlockedCount = achievements.filter((a) => a.unlocked).length

  res.json({
    achievements,
    stats: {
      totalExams,
      totalQuestions,
      totalCorrect,
      bestScore,
      streak,
      unlockedCount,
    },
  })
})

// ---- GET /daily-progress ---------------------------------------------

userRouter.get("/daily-progress", async (req, res) => {
  const me = await getSession(req)
  if (!me) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  const nowMs = Date.now()

  const todayStart = new Date(tehranDayStartMs(nowMs))

  const sessionIds = await db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(eq(examSessions.userId, me.id))
    .all()

  const answerRows = await db
    .select({ id: answers.id })
    .from(answers)
    .where(
      and(
        sessionIds.length > 0
          ? inArray(
              answers.sessionId,
              sessionIds.map((s) => s.id),
            )
          : undefined,
        gte(answers.answeredAt, todayStart),
      ),
    )
    .all()

  res.json({
    todayAnswered: answerRows.length,
    date: tehranDayKey(new Date(nowMs)),
  })
})

// ---- GET /heatmap (?range=7|30) -------------------------------------

userRouter.get("/heatmap", async (req, res) => {
  const me = await getSession(req)
  if (!me) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  const range = req.query.range === "30" ? 30 : 7

  const dayCount = range

  const days: {
    date: string
    count: number
    label: string
    dayNum: number
  }[] = []

  const rangeStartMs = tehranDayStartMs(Date.now())
  const firstDay = new Date(rangeStartMs - (dayCount - 1) * 86400000)

  // One bounded query (no GROUP BY on ms timestamps — every distinct
  // millisecond was its own group); bucket into Tehran days in JS.
  const since = firstDay
  const countsByDay = new Map<string, number>()

  const mySessionIds = await db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(eq(examSessions.userId, me.id))
    .all()

  const answerTimes =
    mySessionIds.length > 0
      ? await db
          .select({ answeredAt: answers.answeredAt })
          .from(answers)
          .where(
            and(
              inArray(
                answers.sessionId,
                mySessionIds.map((s) => s.id),
              ),
              gte(answers.answeredAt, since),
            ),
          )
          .all()
      : []

  for (const row of answerTimes) {
    const key = tehranDayKey(row.answeredAt)
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1)
  }

  for (let i = dayCount - 1; i >= 0; i--) {
    const key = tehranDayKey(new Date(rangeStartMs - i * 86400000))

    const count = countsByDay.get(key) ?? 0

    days.push({
      date: key,
      count,
      label: new Intl.DateTimeFormat("fa-IR", { weekday: "short" }).format(new Date(`${key}T12:00:00Z`)),
      dayNum: Number(key.slice(8, 10)),
    })
  }

  const max = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((a, d) => a + d.count, 0)
  const activeDays = days.filter((d) => d.count > 0).length

  res.json({ days, max, total, activeDays, range: dayCount })
})
