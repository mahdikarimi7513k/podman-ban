
import * as React from "react"
import { io, type Socket } from "socket.io-client"
import { apiFetch } from "@/lib/api-client"

export interface ChatMessage {
  id: string
  userId: string
  sender: "STUDENT" | "ADMIN"
  text: string
  createdAt: string
  readAt?: string | null
}

interface UseChatOpts {
  /** conversation owner. For a student it is their own id; for admin it is the selected user. */
  userId: string | null
  isAdmin: boolean
}

/**
 * Real-time chat hook (socket.io is the primary live channel).
 *
 * Connection: same-origin socket to the API server (chat runs in-process,
 * see server/src/lib/chat-socket.ts).
 * Catch-up: fetch on mount, on socket reconnect, and on tab focus — covers
 * messages missed while offline/backgrounded, or if the socket never
 * connects at all on a host that blocks websockets. No interval polling.
 * Sending: POST /api/support/messages, then optimistically adds the message.
 */
export function useChat({ userId, isAdmin }: UseChatOpts) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [connected, setConnected] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const socketRef = React.useRef<Socket | null>(null)
  const userIdRef = React.useRef(userId)
  userIdRef.current = userId

  const fetchMessages = React.useCallback(async () => {
    if (!userId) return
    try {
      const endpoint = isAdmin
        ? `/api/support/messages?userId=${encodeURIComponent(userId)}`
        : "/api/support/messages"
      const res = await apiFetch<{ messages: ChatMessage[] }>(endpoint)
      setMessages(res.messages)
    } catch {
      /* ignore */
    }
  }, [userId, isAdmin])

  // Latest fetch for the socket reconnect handler (avoids re-creating the socket).
  const fetchRef = React.useRef(fetchMessages)
  fetchRef.current = fetchMessages

  // ---- load history ----
  React.useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await fetchMessages()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, isAdmin, fetchMessages])

  // ---- socket (the live channel — retries forever, catches up on reconnect) ----
  React.useEffect(() => {
    // Same-origin connection — the main API server proxies /socket.io/* to
    // the chat mini-service (see server/src/index.ts). No explicit url/port
    // needed: this works identically in dev (Vite proxy) and production
    // (cPanel, single public domain).
    const socket = io({
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
    })
    socketRef.current = socket

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))
    socket.on("connect_error", () => setConnected(false))

    // Reconnected after a drop (server restart, network blip): one catch-up
    // fetch covers missed messages. No interval polling — the socket is the
    // single source of live updates and it retries forever by default.
    socket.io.on("reconnect", () => {
      setConnected(true)
      void fetchRef.current()
    })

    socket.on("chat:message", (msg: ChatMessage) => {
      if (msg.userId !== userIdRef.current) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  // ---- catch-up on tab focus (covers a socket that never connects at all) ----
  React.useEffect(() => {
    if (!userId) return
    const onFocus = () => {
      if (document.visibilityState === "visible") void fetchRef.current()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [userId])

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !userId) return
      setSending(true)
      try {
        const body: Record<string, unknown> = { text: trimmed }
        if (isAdmin) body.userId = userId
        const res = await apiFetch<{ message: ChatMessage }>("/api/support/messages", {
          method: "POST",
          body: JSON.stringify(body),
        })
        // optimistically add the message immediately
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev
          return [...prev, res.message]
        })
      } finally {
        setSending(false)
      }
    },
    [userId, isAdmin],
  )

  const markRead = React.useCallback(async () => {
    if (!isAdmin || !userId) return
    try {
      await apiFetch(`/api/support/read?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    } catch {
      /* ignore */
    }
  }, [isAdmin, userId])

  return { messages, loading, connected, sending, send, markRead }
}
