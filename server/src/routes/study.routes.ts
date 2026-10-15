/**
 * Study rooms (اتاق مطالعه) + focus timer + client logs.
 *
 * Endpoints (mounted under /api):
 *   GET  /study/overview            personal countdown + totals
 *   GET  /study/rooms               list active rooms
 *   POST /study/rooms               create room (CSRF)
 *   POST /study/rooms/join          join by roomId or inviteCode (CSRF)
 *   POST /study/rooms/:id/leave     leave room (CSRF)
 *   GET  /study/rooms/:id           room detail + leaderboard
 *   GET  /study/session/active      current session + serverNow
 *   POST /study/session/start       start focus (CSRF)
 *   POST /study/session/pause       pause focus (CSRF)
 *   POST /study/session/resume      resume focus (CSRF)
 *   POST /study/session/stop        stop focus (CSRF)
 *   POST /client-logs               browser/APK error reports (rate-limited)
 */
import { Router } from "express"
import { z } from "zod"
import { and, desc, eq, gte, inArray } from "drizzle-orm"
import { db } from "../lib/db.js"
import { studyMembers, studyRooms, studySessions, users } from "../lib/db/schema.js"
import { getSession, requireCsrf, rateLimit, clientIp, socketIp } from "../lib/auth/index.js"
import { getAppState } from "../lib/remote-config.js"
import { logClient, logInfo, logWarn } from "../lib/logger.js"
import {
  parseBody,
  studyJoinSchema,
  studyRoomCreateSchema,
  studySessionStartSchema,
  studyChallengeSchema,
} from "../lib/validations.js"

export const studyRouter = Router()

const TEHRAN_TZ = "Asia/Tehran"

const tehranDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TEHRAN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

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

function tehranDayStartMs(nowMs: number): number {
  const parts = tehranDayKey(new Date(nowMs)).split("-").map(Number)
  const y = parts[0] ?? 1970
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  const off = tehranOffsetMs(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))

  return Date.UTC(y, m - 1, d, 0, 0, 0) - off
}

/** Live duration of a session row at `nowMs`. */
function sessionDurationMs(
  s: { status: string; startedAt: Date; accumulatedMs: number; pausedAt: Date | null },
  nowMs: number,
): number {
  if (s.status === "ENDED") return s.accumulatedMs

  if (s.status === "PAUSED") return s.accumulatedMs
  const live = nowMs - s.startedAt.getTime()

  return s.accumulatedMs + Math.max(0, live)
}

function newInviteCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * Decode the user's own daily study-minutes goal from the prefs blob.
 * Never throws, never trusts the shape: only a finite integer in range
 * wins, otherwise the caller keeps its fallback (admin default).
 */
function resolveStudyGoalFromPrefs(prefs: string | null | undefined, fallback: number): number {
  if (!prefs) return fallback

  let raw: unknown

  try {
    raw = JSON.parse(prefs)
  } catch {
    return fallback
  }

  // Property reads on primitives box safely (yield undefined); only
  // null/array need exclusion before the assertion below.
  if (raw === null || Array.isArray(raw)) return fallback

  // SAFETY: null/array excluded above; primitives yield undefined fields,
  // which the finiteness check below rejects — mirroring parseExamPrefs.
  const rec = raw as { studyGoalMin?: unknown }

  if (!Number.isFinite(rec.studyGoalMin)) return fallback

  // SAFETY: finiteness just passed, so this is a finite number.
  const v = rec.studyGoalMin as number

  if (!Number.isInteger(v) || v < 30 || v > 960) return fallback

  return v
}

async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newInviteCode()
    const exists = await db.select({ id: studyRooms.id }).from(studyRooms).where(eq(studyRooms.inviteCode, code)).get()

    if (!exists) return code
  }

  return `${Date.now() % 900000 + 100000}`
}

// ---- GET /study/overview ----
studyRouter.get("/study/overview", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  const range = req.query.range === "week" ? "week" : req.query.range === "month" ? "month" : "today"
  const nowMs = Date.now()
  const dayStart = tehranDayStartMs(nowMs)
  const rangeStartMs = range === "today" ? dayStart : range === "week" ? dayStart - 6 * 86400000 : dayStart - 29 * 86400000
  const rangeStart = new Date(rangeStartMs)
  const state = await getAppState()

  // The daily study goal belongs to the user (set in settings); the admin
  // value is only the default for users who never picked one.
  let goalMinutes = state.studyDailyGoalMin

  try {
    const dbUser = await db
      .select({ prefs: users.prefs })
      .from(users)
      .where(eq(users.id, user.id))
      .get()

    goalMinutes = resolveStudyGoalFromPrefs(dbUser?.prefs ?? null, goalMinutes)
  } catch {
    /* unreadable prefs → admin default */
  }

  const sessions = await db
    .select({
      id: studySessions.id,
      status: studySessions.status,
      startedAt: studySessions.startedAt,
      accumulatedMs: studySessions.accumulatedMs,
      pausedAt: studySessions.pausedAt,
      endedAt: studySessions.endedAt,
      subject: studySessions.subject,
    })
    .from(studySessions)
    .where(and(eq(studySessions.userId, user.id), gte(studySessions.startedAt, rangeStart)))
    .all()

  let totalMs = 0
  const bySubject = new Map<string, number>()

  for (const s of sessions) {
    const dur = sessionDurationMs(
      { status: s.status, startedAt: s.startedAt, accumulatedMs: s.accumulatedMs, pausedAt: s.pausedAt },
      nowMs,
    )

    totalMs += dur
    const key = s.subject?.trim() || "مطالعه عمومی"
    bySubject.set(key, (bySubject.get(key) ?? 0) + dur)
  }

  const subjects = [...bySubject.entries()]
    .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60000) }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6)

  // Konkur countdown (admin-selectable date).
  let konkur: { date: string; totalDays: number; months: number; days: number } | null = null

  if (state.konkurDate) {
    const target = Date.parse(state.konkurDate)

    if (!Number.isNaN(target)) {
      const diffMs = Math.max(0, target - nowMs)
      const totalDays = Math.ceil(diffMs / 86400000)
      konkur = { date: state.konkurDate, totalDays, months: Math.floor(totalDays / 30), days: totalDays % 30 }
    }
  }

  res.json({
    range,
    totalMinutes: Math.round(totalMs / 60000),
    goalMinutes,
    subjects,
    konkur,
    serverNow: new Date(nowMs).toISOString(),
  })
})

// ---- GET /study/rooms ----
studyRouter.get("/study/rooms", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  const rooms = await db.select().from(studyRooms).orderBy(desc(studyRooms.createdAt)).limit(50).all()

  if (rooms.length === 0) {
    res.json({ rooms: [] })

    return
  }

  const roomIds = rooms.map((r) => r.id)

  const members = await db
    .select({ roomId: studyMembers.roomId, userId: studyMembers.userId })
    .from(studyMembers)
    .where(inArray(studyMembers.roomId, roomIds))
    .all()

  const activeSessions = await db
    .select({ roomId: studySessions.roomId, userId: studySessions.userId, status: studySessions.status })
    .from(studySessions)
    .where(inArray(studySessions.roomId, roomIds))
    .all()

  const liveByRoom = new Map<string, Set<string>>()

  for (const s of activeSessions) {
    if (s.status !== "ACTIVE") continue
    const set = liveByRoom.get(s.roomId) ?? new Set<string>()
    set.add(s.userId)
    liveByRoom.set(s.roomId, set)
  }

  const memberIds = [...new Set(members.map((m) => m.userId))].slice(0, 200)

  const memberUsers = memberIds.length > 0
    ? await db
      .select({ id: users.id, name: users.name, avatarBase64: users.avatarBase64 })
      .from(users)
      .where(inArray(users.id, memberIds))
      .all()
    : []

  const userById = new Map(memberUsers.map((u) => [u.id, u]))
  const membersByRoom = new Map<string, Array<{ id: string; name: string; avatarBase64: string | null }>>()

  for (const m of members) {
    const u = userById.get(m.userId)

    if (!u) continue
    const list = membersByRoom.get(m.roomId) ?? []

    if (list.length < 4) list.push({ id: u.id, name: u.name, avatarBase64: u.avatarBase64 ?? null })
    membersByRoom.set(m.roomId, list)
  }

  const countByRoom = new Map<string, number>()

  for (const m of members) countByRoom.set(m.roomId, (countByRoom.get(m.roomId) ?? 0) + 1)

  // Today's average per room (mean of member today-ms).
  const dayStart = new Date(tehranDayStartMs(Date.now()))

  const todaySessions = await db
    .select({
      roomId: studySessions.roomId,
      userId: studySessions.userId,
      status: studySessions.status,
      startedAt: studySessions.startedAt,
      accumulatedMs: studySessions.accumulatedMs,
      pausedAt: studySessions.pausedAt,
    })
    .from(studySessions)
    .where(and(inArray(studySessions.roomId, roomIds), gte(studySessions.startedAt, dayStart)))
    .all()

  const msByRoomUser = new Map<string, number>()
  const nowMs = Date.now()

  for (const s of todaySessions) {
    const dur = sessionDurationMs(
      { status: s.status, startedAt: s.startedAt, accumulatedMs: s.accumulatedMs, pausedAt: s.pausedAt },
      nowMs,
    )

    const key = `${s.roomId}:${s.userId}`
    msByRoomUser.set(key, (msByRoomUser.get(key) ?? 0) + dur)
  }

  const avgByRoom = new Map<string, number>()

  for (const r of rooms) {
    const n = countByRoom.get(r.id) ?? 0

    if (n === 0) {
      avgByRoom.set(r.id, 0)
      continue
    }

    let sum = 0

    for (const [key, ms] of msByRoomUser) {
      if (key.startsWith(`${r.id}:`)) sum += ms
    }

    avgByRoom.set(r.id, Math.round(sum / n / 60000))
  }

  res.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      requireInvite: r.requireInvite,
      memberCount: countByRoom.get(r.id) ?? 0,
      studyingNow: liveByRoom.get(r.id)?.size ?? 0,
      avgTodayMin: avgByRoom.get(r.id) ?? 0,
      preview: membersByRoom.get(r.id) ?? [],
      joined: members.some((m) => m.roomId === r.id && m.userId === user.id),
    })),
  })
})

// ---- POST /study/rooms ----
studyRouter.post("/study/rooms", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const ip = clientIp(req)
  const sip = socketIp(req)
  const rl = rateLimit(`study-create:${user.id}`, 10, 300)
  const rlIp = rateLimit(`study-create-ip:${ip}`, 30, 300)
  const rlSock = rateLimit(`study-create-sock:${sip}`, 100, 300)

  if (!rl.ok || !rlIp.ok || !rlSock.ok) {
    res.status(429).json({ error: "تلاش‌های بیش از حد" })

    return
  }

  const data = parseBody(studyRoomCreateSchema, req.body, res)

  if (!data) return
  const inviteCode = await uniqueInviteCode()

  const room = await db
    .insert(studyRooms)
    .values({
      name: data.name.trim(),
      type: data.type,
      capacity: data.capacity,
      requireInvite: data.requireInvite,
      inviteCode,
      ownerId: user.id,
    })
    .returning()
    .get()

  await db.insert(studyMembers).values({ roomId: room.id, userId: user.id }).run()
  res.status(201).json({ room })
})

// ---- POST /study/rooms/join ----
studyRouter.post("/study/rooms/join", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const ip = clientIp(req)
  const sip = socketIp(req)
  const rl = rateLimit(`study-join:${user.id}`, 20, 300)
  const rlIp = rateLimit(`study-join-ip:${ip}`, 60, 300)
  const rlSock = rateLimit(`study-join-sock:${sip}`, 200, 300)

  if (!rl.ok || !rlIp.ok || !rlSock.ok) {
    res.status(429).json({ error: "تلاش‌های بیش از حد" })

    return
  }

  const data = parseBody(studyJoinSchema, req.body, res)

  if (!data) return

  const room = data.roomId
    ? await db.select().from(studyRooms).where(eq(studyRooms.id, data.roomId)).get()
    : await db.select().from(studyRooms).where(eq(studyRooms.inviteCode, data.inviteCode ?? "")).get()

  if (!room) {
    res.status(404).json({ error: "اتاق یافت نشد — کد دعوت را بررسی کنید" })

    return
  }

  const already = await db
    .select({ id: studyMembers.id })
    .from(studyMembers)
    .where(and(eq(studyMembers.roomId, room.id), eq(studyMembers.userId, user.id)))
    .get()

  // Invite-only rooms open only with the code (out-of-band from a friend);
  // tapping the public list is not enough. Members re-join freely.
  if (room.requireInvite && !data.inviteCode && !already) {
    res.status(403).json({ error: "ورود به این اتاق فقط با کد دعوت است" })

    return
  }

  const count = await db.select({ id: studyMembers.id }).from(studyMembers).where(eq(studyMembers.roomId, room.id)).all()

  if (count.length >= room.capacity && !already) {
    res.status(409).json({ error: "ظرفیت اتاق تکمیل است (حداکثر ۳۰ نفر)" })

    return
  }

  if (!already) {
    await db.insert(studyMembers).values({ roomId: room.id, userId: user.id }).run()
  }

  res.json({ room })
})

// ---- POST /study/rooms/:id/leave ----
studyRouter.post("/study/rooms/:id/leave", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const roomId = req.params.id

  // Stop live session in this room first (server-authoritative).
  const live = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.roomId, roomId), eq(studySessions.userId, user.id)))
    .all()

  const now = new Date()

  for (const s of live) {
    if (s.status === "ENDED") continue
    const extra = s.status === "ACTIVE" ? Math.max(0, now.getTime() - s.startedAt.getTime()) : 0

    await db
      .update(studySessions)
      .set({ status: "ENDED", accumulatedMs: s.accumulatedMs + extra, endedAt: now, pausedAt: null })
      .where(eq(studySessions.id, s.id))
      .run()
  }

  await db
    .delete(studyMembers)
    .where(and(eq(studyMembers.roomId, roomId), eq(studyMembers.userId, user.id)))
    .run()

  // Ownership passes to the earliest-joined remaining member so the room
  // never becomes ownerless (members stay manageable).
  const room = await db.select().from(studyRooms).where(eq(studyRooms.id, roomId)).get()

  if (room && room.ownerId === user.id) {
    const next = await db
      .select({ userId: studyMembers.userId, joinedAt: studyMembers.joinedAt })
      .from(studyMembers)
      .where(eq(studyMembers.roomId, roomId))
      .orderBy(studyMembers.joinedAt)
      .limit(1)
      .get()

    await db
      .update(studyRooms)
      .set({ ownerId: next?.userId ?? null })
      .where(eq(studyRooms.id, roomId))
      .run()
  }

  res.json({ ok: true })
})

// ---- POST /study/rooms/:id/members/:userId/remove (owner only, CSRF) ----
// The room owner manages the roster: removing a member also stops their
// live session in this room. The owner cannot remove themselves here —
// leaving (which transfers ownership) is the exit path.

studyRouter.post("/study/rooms/:id/members/:userId/remove", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const roomId = req.params.id
  const targetId = req.params.userId
  const room = await db.select().from(studyRooms).where(eq(studyRooms.id, roomId)).get()

  if (!room) {
    res.status(404).json({ error: "اتاق یافت نشد" })

    return
  }

  if (room.ownerId !== user.id) {
    res.status(403).json({ error: "فقط سازنده اتاق می‌تواند اعضا را حذف کند" })

    return
  }

  if (targetId === user.id) {
    res.status(400).json({ error: "برای خروج از اتاق از دکمه خروج استفاده کنید" })

    return
  }

  const membership = await db
    .select({ id: studyMembers.id })
    .from(studyMembers)
    .where(and(eq(studyMembers.roomId, roomId), eq(studyMembers.userId, targetId)))
    .get()

  if (!membership) {
    res.status(404).json({ error: "این کاربر عضو اتاق نیست" })

    return
  }

  const now = new Date()

  const live = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.roomId, roomId), eq(studySessions.userId, targetId)))
    .all()

  for (const s of live) {
    if (s.status === "ENDED") continue
    const extra = s.status === "ACTIVE" ? Math.max(0, now.getTime() - s.startedAt.getTime()) : 0

    await db
      .update(studySessions)
      .set({ status: "ENDED", accumulatedMs: s.accumulatedMs + extra, endedAt: now, pausedAt: null })
      .where(eq(studySessions.id, s.id))
      .run()
  }

  await db
    .delete(studyMembers)
    .where(and(eq(studyMembers.roomId, roomId), eq(studyMembers.userId, targetId)))
    .run()

  logInfo("[study] member removed", { roomId, by: user.id, removedId: targetId })

  res.json({ ok: true })
})

// ---- POST /study/rooms/:id/challenge (owner only, CSRF) ----
// The room owner sets a daily minutes challenge for the whole room.
// Shown to every member next to the weekly challenge.

studyRouter.post("/study/rooms/:id/challenge", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const roomId = req.params.id
  const room = await db.select().from(studyRooms).where(eq(studyRooms.id, roomId)).get()

  if (!room) {
    res.status(404).json({ error: "اتاق یافت نشد" })

    return
  }

  const isSiteAdmin = user.role === "ADMIN"

  if (room.ownerId !== user.id && !isSiteAdmin) {
    res.status(403).json({ error: "فقط سازنده اتاق می‌تواند چالش بگذارد" })

    return
  }

  const data = parseBody(studyChallengeSchema, req.body, res)

  if (!data) return

  const updated = await db
    .update(studyRooms)
    .set({ dailyChallengeMin: data.minutes })
    .where(eq(studyRooms.id, roomId))
    .returning({ dailyChallengeMin: studyRooms.dailyChallengeMin })
    .get()

  res.json({ dailyChallengeMin: updated?.dailyChallengeMin ?? null })
})

// ---- GET /study/rooms/:id ----
studyRouter.get("/study/rooms/:id", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  const roomId = req.params.id
  const room = await db.select().from(studyRooms).where(eq(studyRooms.id, roomId)).get()

  if (!room) {
    res.status(404).json({ error: "اتاق یافت نشد" })

    return
  }

  const memberRows = await db.select().from(studyMembers).where(eq(studyMembers.roomId, roomId)).all()
  const memberIds = memberRows.map((m) => m.userId)

  const profiles = memberIds.length > 0
    ? await db
      .select({ id: users.id, name: users.name, avatarBase64: users.avatarBase64 })
      .from(users)
      .where(inArray(users.id, memberIds))
      .all()
    : []

  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const nowMs = Date.now()
  const dayStart = new Date(tehranDayStartMs(nowMs))
  const weekStart = new Date(tehranDayStartMs(nowMs) - 6 * 86400000)

  const sessions = memberIds.length > 0
    ? await db
      .select()
      .from(studySessions)
      .where(and(inArray(studySessions.userId, memberIds), gte(studySessions.startedAt, weekStart)))
      .all()
    : []

  const todayMs = new Map<string, number>()
  const weekMs = new Map<string, number>()
  const liveStatus = new Map<string, "studying" | "paused">()

  for (const s of sessions) {
    const dur = sessionDurationMs(
      { status: s.status, startedAt: s.startedAt, accumulatedMs: s.accumulatedMs, pausedAt: s.pausedAt },
      nowMs,
    )

    weekMs.set(s.userId, (weekMs.get(s.userId) ?? 0) + dur)

    if (s.startedAt.getTime() >= dayStart.getTime()) {
      todayMs.set(s.userId, (todayMs.get(s.userId) ?? 0) + dur)
    }

    if (s.roomId === roomId && s.status === "ACTIVE") liveStatus.set(s.userId, "studying")
    else if (s.roomId === roomId && s.status === "PAUSED" && !liveStatus.has(s.userId)) liveStatus.set(s.userId, "paused")
  }

  const leaderboard = memberIds
    .map((id) => ({
      id,
      name: profileById.get(id)?.name ?? "کاربر",
      avatarBase64: profileById.get(id)?.avatarBase64 ?? null,
      todayMin: Math.round((todayMs.get(id) ?? 0) / 60000),
      weekMin: Math.round((weekMs.get(id) ?? 0) / 60000),
      status: liveStatus.get(id) ?? "rest",
      isMe: id === user.id,
    }))
    .sort((a, b) => b.todayMin - a.todayMin)

  // My live session in this room (for the big timer).
  const mySession = sessions.find(
    (s) => s.userId === user.id && s.roomId === roomId && (s.status === "ACTIVE" || s.status === "PAUSED"),
  )

  const myMs = mySession
    ? sessionDurationMs(
      { status: mySession.status, startedAt: mySession.startedAt, accumulatedMs: mySession.accumulatedMs, pausedAt: mySession.pausedAt },
      nowMs,
    )
    : 0

  const state = await getAppState()
  let weekGoalMin = state.studyDailyGoalMin * 7

  try {
    const dbUser = await db
      .select({ prefs: users.prefs })
      .from(users)
      .where(eq(users.id, user.id))
      .get()

    weekGoalMin = resolveStudyGoalFromPrefs(dbUser?.prefs ?? null, state.studyDailyGoalMin) * 7
  } catch {
    /* unreadable prefs → admin default */
  }

  const roomWeekMin = leaderboard.reduce((a, m) => a + m.weekMin, 0)
  const roomTodayMin = leaderboard.reduce((a, m) => a + m.todayMin, 0)

  res.json({
    room: {
      id: room.id,
      name: room.name,
      type: room.type,
      capacity: room.capacity,
      // Invite code is member-only: it is the key to invite-only rooms.
      inviteCode: memberIds.includes(user.id) ? room.inviteCode : null,
      memberCount: memberRows.length,
      studyingNow: [...liveStatus.values()].filter((v) => v === "studying").length,
      joined: memberIds.includes(user.id),
      isOwner: room.ownerId === user.id,
    },
    leaderboard,
    mySession: mySession
      ? {
        id: mySession.id,
        status: mySession.status,
        elapsedMs: myMs,
        startedAt: mySession.startedAt.toISOString(),
        serverNow: new Date(nowMs).toISOString(),
      }
      : null,
    challenge: { weekMin: roomWeekMin, goalMin: weekGoalMin },
    dailyChallenge: room.dailyChallengeMin != null
      ? { goalMin: room.dailyChallengeMin, todayMin: roomTodayMin }
      : null,
    serverNow: new Date(nowMs).toISOString(),
  })
})

// ---- GET /study/session/active ----
studyRouter.get("/study/session/active", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  const nowMs = Date.now()
  const rows = await db.select().from(studySessions).where(eq(studySessions.userId, user.id)).all()
  const live = rows.find((r) => r.status === "ACTIVE" || r.status === "PAUSED")

  if (!live) {
    res.json({ session: null, serverNow: new Date(nowMs).toISOString() })

    return
  }

  res.json({
    session: {
      id: live.id,
      roomId: live.roomId,
      status: live.status,
      elapsedMs: sessionDurationMs(
        { status: live.status, startedAt: live.startedAt, accumulatedMs: live.accumulatedMs, pausedAt: live.pausedAt },
        nowMs,
      ),
      startedAt: live.startedAt.toISOString(),
    },
    serverNow: new Date(nowMs).toISOString(),
  })
})

async function endUserLiveSessions(userId: string, now: Date): Promise<void> {
  const rows = await db.select().from(studySessions).where(eq(studySessions.userId, userId)).all()

  for (const s of rows) {
    if (s.status === "ENDED") continue
    const extra = s.status === "ACTIVE" ? Math.max(0, now.getTime() - s.startedAt.getTime()) : 0
    await db
      .update(studySessions)
      .set({ status: "ENDED", accumulatedMs: s.accumulatedMs + extra, endedAt: now, pausedAt: null })
      .where(eq(studySessions.id, s.id))
      .run()
  }
}

// ---- POST /study/session/start ----
studyRouter.post("/study/session/start", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const sip = socketIp(req)
  const rl = rateLimit(`study-session:${user.id}`, 30, 300)
  const rlSock = rateLimit(`study-session-sock:${sip}`, 300, 300)

  if (!rl.ok || !rlSock.ok) {
    res.status(429).json({ error: "تلاش‌های بیش از حد" })

    return
  }

  const data = parseBody(studySessionStartSchema, req.body, res)

  if (!data) return

  const membership = await db
    .select({ id: studyMembers.id })
    .from(studyMembers)
    .where(and(eq(studyMembers.roomId, data.roomId), eq(studyMembers.userId, user.id)))
    .get()

  if (!membership) {
    res.status(403).json({ error: "اول وارد اتاق شوید" })

    return
  }

  const now = new Date()
  await endUserLiveSessions(user.id, now)

  const row = await db
    .insert(studySessions)
    .values({ roomId: data.roomId, userId: user.id, status: "ACTIVE", startedAt: now, subject: data.subject ?? null })
    .returning()
    .get()

  res.status(201).json({
    session: {
      id: row.id,
      roomId: row.roomId,
      status: row.status,
      elapsedMs: 0,
      startedAt: row.startedAt.toISOString(),
      serverNow: now.toISOString(),
    },
  })
})

// ---- POST /study/session/pause ----
studyRouter.post("/study/session/pause", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const rows = await db.select().from(studySessions).where(eq(studySessions.userId, user.id)).all()
  const live = rows.find((r) => r.status === "ACTIVE")

  if (!live) {
    res.status(404).json({ error: "نشست فعالی نیست" })

    return
  }

  const now = new Date()
  const extra = Math.max(0, now.getTime() - live.startedAt.getTime())

  const updated = await db
    .update(studySessions)
    .set({ status: "PAUSED", accumulatedMs: live.accumulatedMs + extra, pausedAt: now })
    .where(eq(studySessions.id, live.id))
    .returning()
    .get()

  res.json({
    session: {
      id: updated.id,
      roomId: updated.roomId,
      status: updated.status,
      elapsedMs: updated.accumulatedMs,
      serverNow: now.toISOString(),
    },
  })
})

// ---- POST /study/session/resume ----
studyRouter.post("/study/session/resume", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const rows = await db.select().from(studySessions).where(eq(studySessions.userId, user.id)).all()
  const paused = rows.find((r) => r.status === "PAUSED")

  if (!paused) {
    res.status(404).json({ error: "نشست متوقفی نیست" })

    return
  }

  const now = new Date()

  const updated = await db
    .update(studySessions)
    .set({ status: "ACTIVE", startedAt: now, pausedAt: null })
    .where(eq(studySessions.id, paused.id))
    .returning()
    .get()

  res.json({
    session: {
      id: updated.id,
      roomId: updated.roomId,
      status: updated.status,
      elapsedMs: updated.accumulatedMs,
      startedAt: now.toISOString(),
      serverNow: now.toISOString(),
    },
  })
})

// ---- POST /study/session/stop ----
studyRouter.post("/study/session/stop", async (req, res) => {
  const user = await getSession(req)

  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })

    return
  }

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const rows = await db.select().from(studySessions).where(eq(studySessions.userId, user.id)).all()
  const live = rows.find((r) => r.status === "ACTIVE" || r.status === "PAUSED")

  if (!live) {
    res.status(404).json({ error: "نشست فعالی نیست" })

    return
  }

  const now = new Date()
  const extra = live.status === "ACTIVE" ? Math.max(0, now.getTime() - live.startedAt.getTime()) : 0
  const total = live.accumulatedMs + extra
  await db
    .update(studySessions)
    .set({ status: "ENDED", accumulatedMs: total, endedAt: now, pausedAt: null })
    .where(eq(studySessions.id, live.id))
    .run()
  res.json({ ok: true, elapsedMs: total })
})

// ---- POST /client-logs ----
const clientLogSchema = z.object({
  source: z.string().trim().min(1).max(80).default("web"),
  level: z.enum(["debug", "info", "warn", "error"]).default("error"),
  message: z.string().trim().min(1).max(2000),
  meta: z.record(z.string(), z.unknown()).optional(),
})

studyRouter.post("/client-logs", async (req, res) => {
  const ip = clientIp(req)
  const sip = socketIp(req)
  const rl = rateLimit(`clientlog:${ip}`, 60, 300)
  const rlSock = rateLimit(`clientlog-sock:${sip}`, 200, 300)

  if (!rl.ok || !rlSock.ok) {
    res.status(429).json({ error: "تلاش‌های بیش از حد" })

    return
  }

  const parsed = clientLogSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" })

    return
  }

  const session = await getSession(req).catch(() => null)
  const data = parsed.data
  // SAFETY: cap meta size — client logs must not become a disk-fill vector.
  const metaText = data.meta ? JSON.stringify(data.meta).slice(0, 2000) : undefined

  if (data.level === "error" || data.level === "warn") {
    logWarn(`client log (${data.source})`, {
      userId: session?.id ?? null,
      ip,
      message: data.message.slice(0, 500),
      meta: metaText,
    })
  }

  logClient(data.source, data.level, data.message.slice(0, 500), {
    userId: session?.id ?? null,
    ip,
    meta: metaText,
  })
  res.json({ ok: true })
})
