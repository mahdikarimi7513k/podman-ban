/**
 * Support chat routes.
 *
 * Endpoints:
 *   GET  /messages      — list messages (student: own; admin: ?userId=...)
 *   POST /messages       — send a message (CSRF; admin passes userId in body)
 *   GET  /conversations  — admin-only list of student conversations
 *   POST /read           — admin marks a conversation as read (CSRF, ?userId=...)
 */

import { Router } from "express"
import { z } from "zod"
import { and, asc, count, desc, eq, isNull } from "drizzle-orm"
import { db } from "../lib/db.js"
import { chatMessages, users } from "../lib/db/schema.js"
import {
  getSession,
  requireAdmin,
  requireCsrf,
  rateLimit,
  clientIp,
  socketIp,
} from "../lib/auth/index.js"
import { ioEmitChatMessage, ioEmitChatRead } from "../lib/chat-socket.js"
import { parseBody } from "../lib/validations.js"

export const supportRouter = Router()

const chatSendSchemaWithUser = z.object({
  text: z.string().trim().min(1).max(2000),
  userId: z.string().optional(),
})

// ---- GET /messages ---------------------------------------------------

supportRouter.get("/messages", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  // For students: only their own conversation.
  // For staff (ADMIN / CONTENT_ADMIN): ?userId=<id> required — any conversation.
  const isStaff = user.role === "ADMIN" || user.role === "CONTENT_ADMIN"
  const targetUserId = isStaff
    ? (req.query.userId as string | undefined)
    : user.id
  if (!targetUserId) {
    res.status(403).json({ error: "userId لازم است" })
    return
  }
  const messages = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      sender: chatMessages.sender,
      text: chatMessages.text,
      createdAt: chatMessages.createdAt,
      readAt: chatMessages.readAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.userId, targetUserId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(200)
    .all()
  res.json({ messages, userId: targetUserId })
})

// ---- POST /messages (CSRF) ------------------------------------------

supportRouter.post("/messages", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }

  // Chat is the only unbounded write path left: without a quota one
  // account (or one NAT address) can flood the table and fan out noise
  // to every admin socket. 30/5min per sender never trips a real
  // conversation; the IP + socket floors mirror the login hardening.
  const ip = clientIp(req)
  const sip = socketIp(req)
  const rlSelf = rateLimit(`chat-u:${user.id}`, 30, 300)
  const rlIp = rateLimit(`chat-ip:${ip}`, 60, 300)
  const rlSock = rateLimit(`chat-ip-sock:${sip}`, 300, 300)

  if (!rlSelf.ok || !rlIp.ok || !rlSock.ok) {
    res.status(429).json({
      error: "تلاش‌های بیش از حد",
      retryAfterSec: Math.max(rlSelf.retryAfterSec, rlIp.retryAfterSec, rlSock.retryAfterSec),
    })

    return
  }

  const data = parseBody(chatSendSchemaWithUser, req.body, res)
  if (!data) return
  const { text, userId: bodyUserId } = data

  // For a student, the conversation is theirs (userId = self).
  // For admin, they reply to an existing conversation — userId required (body
  // takes priority over query string).
  const isStaff = user.role === "ADMIN" || user.role === "CONTENT_ADMIN"
  let targetUserId = user.id
  if (isStaff) {
    const q = bodyUserId ?? (req.query.userId as string | undefined)
    if (!q) {
      res.status(400).json({ error: "برای پاسخ، userId لازم است" })
      return
    }
    targetUserId = q
    const exists = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, q))
      .get()
    if (!exists) {
      res.status(404).json({ error: "کاربر یافت نشد" })
      return
    }
  }

  const msg = await db
    .insert(chatMessages)
    .values({
      userId: targetUserId,
      sender: user.role === "ADMIN" || user.role === "CONTENT_ADMIN" ? "ADMIN" : "STUDENT",
      text,
    })
    .returning()
    .get()

  ioEmitChatMessage({
    userId: targetUserId,
    sender: msg.sender,
    text: msg.text,
    createdAt: msg.createdAt.toISOString(),
    id: msg.id,
  })

  res.status(201).json({ message: msg })
})

// ---- GET /conversations (admin-only) --------------------------------

supportRouter.get("/conversations", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return

  const userRows = await db.query.users.findMany({
    where: eq(users.role, "STUDENT"),
    orderBy: desc(users.createdAt),
    columns: { id: true, username: true, name: true, field: true },
    with: {
      chatMessages: {
        orderBy: desc(chatMessages.createdAt),
        limit: 1,
        columns: { id: true, text: true, sender: true, createdAt: true, readAt: true },
      },
    },
  })
  // count unread (student→admin, unread) per user
  const unreadCounts = await db
    .select({ userId: chatMessages.userId, n: count() })
    .from(chatMessages)
    .where(and(eq(chatMessages.sender, "STUDENT"), isNull(chatMessages.readAt)))
    .groupBy(chatMessages.userId)
    .all()
  const unreadMap = new Map(unreadCounts.map((u) => [u.userId, u.n]))
  res.json({
    conversations: userRows.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      field: u.field,
      unread: unreadMap.get(u.id) ?? 0,
      lastMessage: u.chatMessages[0] ?? null,
    })),
  })
})

// ---- POST /read (admin-only, CSRF, ?userId=...) ----------------------

supportRouter.post("/read", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const userId = req.query.userId as string | undefined
  if (!userId) {
    res.status(400).json({ error: "userId لازم است" })
    return
  }
  await db
    .update(chatMessages)
    .set({ readAt: new Date() })
    .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sender, "STUDENT"), isNull(chatMessages.readAt)))
    .run()
  ioEmitChatRead(userId)
  res.json({ ok: true })
})
