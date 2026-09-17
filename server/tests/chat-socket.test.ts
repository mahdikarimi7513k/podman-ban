/**
 * E2E: realtime chat fan-out over the real HTTP server + socket.io.
 *
 * 1. Student POSTs a message (REST persists it) → the connected admin
 *    receives the SAME persisted id via socket push, no refresh/polling.
 * 2. With the admin socket disconnected, REST is still the source of truth:
 *    the message is persisted and readable via GET /messages (the client's
 *    polling/focus fallback path).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { AddressInfo } from "net"
import { io as ioClient, type Socket } from "socket.io-client"
import { buildApp } from "../src/app.js"
import { attachChatSocket } from "../src/lib/chat-socket.js"
import { login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

let base = ""
let closeServer: () => Promise<void> = async () => {}

beforeAll(async () => {
  const app = buildApp()
  const httpServer = app.listen(0)
  attachChatSocket(httpServer, [])
  await new Promise<void>((r) => httpServer.on("listening", r))
  const { port } = httpServer.address() as AddressInfo
  base = `http://127.0.0.1:${port}`
  closeServer = () =>
    new Promise<void>((resolve, reject) =>
      httpServer.close((e) => (e ? reject(e) : resolve())),
    )
})

afterAll(() => closeServer())

function cookieOf(cookies: string, name: string): string {
  const hit = cookies.split("; ").find((c) => c.startsWith(`${name}=`))
  if (!hit) throw new Error(`missing cookie ${name}`)
  return hit.slice(name.length + 1)
}

function connectSocket(accessToken: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(base, {
      transports: ["websocket"],
      extraHeaders: { cookie: `pb_access=${accessToken}` },
    })
    s.on("connect", () => resolve(s))
    s.on("connect_error", reject)
  })
}

function waitForMessage(s: Socket, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for chat:message")), timeoutMs)
    s.once("chat:message", (m) => {
      clearTimeout(t)
      resolve(m as Record<string, unknown>)
    })
  })
}

describe("chat socket fan-out", () => {
  it("pushes a student message to the admin live (no polling)", async () => {
    await ensureUser("chatstu", "STUDENT", "FANI_HERFEI")
    const stu = await login("chatstu", PASSWORD)
    const admin = await login("sec_admin", PASSWORD)

    const adminSock = await connectSocket(cookieOf(admin.cookies, "pb_access"))
    try {
      const me = await stu.get("/api/auth/me")
      const studentId = me.body.user.id as string

      const push = waitForMessage(adminSock)
      const sent = await stu.post("/api/support/messages").send({ text: "سلام ادمین (e2e)" })
      expect(sent.status).toBe(201)

      const msg = await push
      expect(msg.userId).toBe(studentId)
      expect(msg.text).toBe("سلام ادمین (e2e)")
      // Pushed AFTER persist: the live event carries the real DB id.
      expect(msg.id).toBe(sent.body.message.id)
    } finally {
      adminSock.disconnect()
    }
  })

  it("REST still serves messages with no socket connected (fallback)", async () => {
    await ensureUser("chatstu2", "STUDENT", "FANI_HERFEI")
    const stu = await login("chatstu2", PASSWORD)
    const admin = await login("sec_admin", PASSWORD)

    const sent = await stu.post("/api/support/messages").send({ text: "بدون سوکت" })
    expect(sent.status).toBe(201)

    const me = await stu.get("/api/auth/me")
    const studentId = me.body.user.id as string
    const list = await admin.get(`/api/support/messages?userId=${studentId}`)
    expect(list.status).toBe(200)
    const texts = (list.body.messages as { text: string }[]).map((m) => m.text)
    expect(texts).toContain("بدون سوکت")
  })
})
