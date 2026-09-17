import type { Server as HttpServer } from "http"
import { Server as SocketIOServer, type Socket } from "socket.io"
import type { ChatSender } from "./db/schema.js"
import { verifyAccessToken } from "./auth/jwt.js"
import { readCookieFromHeader } from "./auth/cookies.js"

/**
 * Realtime chat — runs in the same process as the API (no separate service,
 * no relay port, no second thing to keep alive on the host). The HTTP API
 * still persists messages (source of truth); this just fans them out live to
 * connected sockets. If nobody's connected, the client's own polling of
 * /api/support/messages picks messages up within a few seconds regardless.
 */

type Role = "STUDENT" | "ADMIN" | "CONTENT_ADMIN"
const isStaff = (role: Role) => role === "ADMIN" || role === "CONTENT_ADMIN"
const userRoom = (id: string) => `user:${id}`
const ADMINS_ROOM = "admins"

interface ChatMessageEvent {
  id: string
  userId: string
  sender: ChatSender
  text: string
  createdAt: string
}

// Per-socket token bucket: 10 messages burst, refills 1/sec.
const socketRates = new WeakMap<Socket, { tokens: number; last: number }>()
function consumeRate(socket: Socket): boolean {
  const now = Date.now()
  const st = socketRates.get(socket) ?? { tokens: 10, last: now }
  st.tokens = Math.min(10, st.tokens + ((now - st.last) / 1000) * 1)
  st.last = now
  if (st.tokens < 1) return false
  st.tokens -= 1
  socketRates.set(socket, st)
  return true
}

let io: SocketIOServer | null = null

export function attachChatSocket(httpServer: HttpServer, allowedOrigins: string[]): void {
  io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true)
        else cb(null, false)
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  io.on("connection", (socket) => {
    const cookieHeader = socket.request.headers["cookie"]
    const token = readCookieFromHeader(cookieHeader, "pb_access")
    if (!token) {
      socket.disconnect(true)
      return
    }

    verifyAccessToken(token).then((payload) => {
      if (!payload) {
        socket.disconnect(true)
        return
      }
      const user = { id: payload.sub, role: payload.role as Role, name: payload.name }
      void socket.join(userRoom(user.id))
      if (isStaff(user.role)) void socket.join(ADMINS_ROOM)

      socket.on("chat:send", (raw: unknown) => {
        const p = (raw ?? {}) as { userId?: unknown; text?: unknown }
        const targetUserId = typeof p.userId === "string" ? p.userId.trim() : ""
        const text = typeof p.text === "string" ? p.text : ""
        if (!targetUserId || !text || text.length > 2000) return
        if (!consumeRate(socket)) {
          socket.emit("chat:error", { code: "RATE_LIMITED", message: "Too many messages" })
          return
        }
        if (!isStaff(user.role) && targetUserId !== user.id) return

        const message: ChatMessageEvent = {
          id: `live-${socket.id}-${Date.now()}`,
          userId: targetUserId,
          sender: (isStaff(user.role) ? "ADMIN" : "STUDENT") as ChatSender,
          text,
          createdAt: new Date().toISOString(),
        }
        io!.to(userRoom(targetUserId)).emit("chat:message", message)
        io!.to(ADMINS_ROOM).emit("chat:message", message)
      })

      socket.on("chat:typing", (raw: unknown) => {
        const p = (raw ?? {}) as { userId?: unknown }
        let targetUserId = typeof p.userId === "string" ? p.userId.trim() : ""
        if (!targetUserId) return
        if (!isStaff(user.role)) {
          targetUserId = user.id
          io!.to(ADMINS_ROOM).emit("chat:typing", { userId: targetUserId, sender: user.role })
          return
        }
        io!.to(userRoom(targetUserId)).emit("chat:typing", { userId: targetUserId, sender: user.role })
      })

      socket.on("chat:read", (raw: unknown) => {
        const p = (raw ?? {}) as { userId?: unknown }
        const targetUserId = typeof p.userId === "string" ? p.userId.trim() : ""
        if (!targetUserId || !isStaff(user.role)) return
        io!.to(userRoom(targetUserId)).emit("chat:read", { userId: targetUserId })
      })
    })
  })
}

/** Called by the HTTP route after persisting a message — pushes it live. */
export function ioEmitChatMessage(msg: ChatMessageEvent): void {
  io?.to(userRoom(msg.userId)).emit("chat:message", msg)
  io?.to(ADMINS_ROOM).emit("chat:message", msg)
}

/** Called by the HTTP route after marking a conversation read. */
export function ioEmitChatRead(userId: string): void {
  io?.to(userRoom(userId)).emit("chat:read", { userId })
}
