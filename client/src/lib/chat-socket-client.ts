/**
 * Shared chat socket (single connection per app).
 *
 * Two screens need live chat (the thread + the admin conversation list);
 * two connections would double auth load and race reconnects. One module
 * owns the socket; screens only subscribe/unsubscribe their handlers.
 *
 * Reconnect loop fix: the httpOnly access cookie expires every 15 minutes
 * while refresh lives 30 days. After a drop past expiry, every retry
 * carries the stale cookie and the server drops it — an infinite
 * connect/disconnect spin with "در حال اتصال…" stuck on screen. Renewing
 * the session on reconnect attempts (once we connected before) breaks it.
 */
import { io, type Socket } from "socket.io-client"
import { API_BASE, refreshSession } from "@/lib/api-client"

let socket: Socket | null = null

let everConnected = false

export function getChatSocket(): Socket {
  if (socket) return socket

  socket = io(API_BASE || undefined, {
    // WebSocket-first on web; polling-first inside the native app (a raw
    // WebSocket handshake from a WebView carries no synced auth cookies, so
    // the server drops it and the client never retries). Polling rides the
    // native HTTP stack and the later upgrade reuses the session.
    // API_BASE is only set in APK builds.
    transports: API_BASE ? ["polling", "websocket"] : ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  })

  socket.on("connect", () => {
    everConnected = true
  })

  socket.io.on("reconnect_attempt", () => {
    if (everConnected) void refreshSession()
  })

  return socket
}
