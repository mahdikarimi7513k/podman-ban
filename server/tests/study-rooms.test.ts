/**
 * Study rooms E2E (HTTP seam): create → join via invite code → focus timer
 * lifecycle (start/pause/resume/stop) → overview + leaderboard.
 *
 * Also covers: capacity cap (20), non-member start rejection, unauth 401s.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { eq } from "drizzle-orm"
import { login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"
import { db } from "../src/lib/db.js"
import { studyMembers, studyRooms } from "../src/lib/db/schema.js"

beforeAll(ensureFixtures)

async function studentSession(tag: string) {
  await ensureUser(`study_${tag}`, "STUDENT", "FANI_HERFEI")

  return login(`study_${tag}`, PASSWORD)
}

describe("study rooms", () => {
  it("creates a room and auto-joins the owner", async () => {
    const s = await studentSession("owner1")
    const res = await s.post("/api/study/rooms", { name: "ققنوس شب‌خوان", type: "COMPETITIVE", capacity: 20, requireInvite: true })
    expect(res.status).toBe(201)
    expect(res.body.room.name).toBe("ققنوس شب‌خوان")
    expect(res.body.room.inviteCode).toMatch(/^\d{6}$/)
    const list = await s.get("/api/study/rooms")
    expect(list.body.rooms.some((r: { id: string }) => r.id === res.body.room.id)).toBe(true)
  })

  it("rejects invalid room payloads", async () => {
    const s = await studentSession("owner2")
    const short = await s.post("/api/study/rooms", { name: "x" })
    expect(short.status).toBe(422)
    const over = await s.post("/api/study/rooms", { name: "big", capacity: 21 })
    expect(over.status).toBe(422)
  })

  it("joins by invite code and shows up in the room", async () => {
    const owner = await studentSession("owner3")
    const created = await owner.post("/api/study/rooms", { name: "کلاس شبکه", type: "FRIENDLY", capacity: 5, requireInvite: true })
    const code: string = created.body.room.inviteCode
    const guest = await studentSession("guest3")
    const joined = await guest.post("/api/study/rooms/join", { inviteCode: code })
    expect(joined.status).toBe(200)
    const detail = await guest.get(`/api/study/rooms/${created.body.room.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.room.memberCount).toBe(2)
    expect(detail.body.room.joined).toBe(true)
    expect(detail.body.leaderboard).toHaveLength(2)
  })

  it("rejects bad invite codes", async () => {
    const s = await studentSession("owner4")
    const res = await s.post("/api/study/rooms/join", { inviteCode: "000000" })
    expect(res.status).toBe(404)
  })

  it("keeps invite-only rooms closed without the code", async () => {
    const owner = await studentSession("owner7")
    const created = await owner.post("/api/study/rooms", { name: "secret", capacity: 5, requireInvite: true })
    const roomId: string = created.body.room.id
    const outsider = await studentSession("outsider7")
    expect((await outsider.post("/api/study/rooms/join", { roomId })).status).toBe(403)
    // Non-members don't see the code either.
    const detail = await outsider.get(`/api/study/rooms/${roomId}`)
    expect(detail.body.room.inviteCode).toBeNull()
    expect((await outsider.post("/api/study/rooms/join", { inviteCode: created.body.room.inviteCode })).status).toBe(200)
  })

  it("enforces the 20-member capacity", async () => {
    const owner = await studentSession("owner5")
    const created = await owner.post("/api/study/rooms", { name: "tiny", capacity: 2, requireInvite: false })
    const roomId: string = created.body.room.id
    const g1 = await studentSession("cap1")
    expect((await g1.post("/api/study/rooms/join", { roomId })).status).toBe(200)
    const g2 = await studentSession("cap2")
    expect((await g2.post("/api/study/rooms/join", { roomId })).status).toBe(409)
  })

  it("runs the focus timer lifecycle with server truth", async () => {
    const s = await studentSession("timer1")
    const created = await s.post("/api/study/rooms", { name: "timer room", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    const started = await s.post("/api/study/session/start", { roomId })
    expect(started.status).toBe(201)
    expect(started.body.session.status).toBe("ACTIVE")
    const active = await s.get("/api/study/session/active")
    expect(active.body.session.id).toBe(started.body.session.id)
    expect(active.body.serverNow).toBeTruthy()
    const paused = await s.post("/api/study/session/pause", {})
    expect(paused.status).toBe(200)
    expect(paused.body.session.status).toBe("PAUSED")
    const resumed = await s.post("/api/study/session/resume", {})
    expect(resumed.body.session.status).toBe("ACTIVE")
    const stopped = await s.post("/api/study/session/stop", {})
    expect(stopped.status).toBe(200)
    expect(typeof stopped.body.elapsedMs).toBe("number")
    const gone = await s.get("/api/study/session/active")
    expect(gone.body.session).toBeNull()
  })

  it("only allows one live session per user", async () => {
    const s = await studentSession("timer2")
    const r1 = await s.post("/api/study/rooms", { name: "r1", capacity: 5, requireInvite: false })
    const r2 = await s.post("/api/study/rooms", { name: "r2", capacity: 5, requireInvite: false })
    await s.post("/api/study/session/start", { roomId: r1.body.room.id })
    await s.post("/api/study/session/start", { roomId: r2.body.room.id })
    const active = await s.get("/api/study/session/active")
    expect(active.body.session.roomId).toBe(r2.body.room.id)
  })

  it("rejects session start for non-members", async () => {
    const owner = await studentSession("owner6")
    const created = await owner.post("/api/study/rooms", { name: "private", capacity: 5, requireInvite: true })
    const outsider = await studentSession("outsider6")
    const res = await outsider.post("/api/study/session/start", { roomId: created.body.room.id })
    expect(res.status).toBe(403)
  })

  it("reports overview totals and konkur countdown", async () => {
    const s = await studentSession("overview1")
    const res = await s.get("/api/study/overview?range=today")
    expect(res.status).toBe(200)
    expect(typeof res.body.totalMinutes).toBe("number")
    expect(typeof res.body.goalMinutes).toBe("number")
    expect(Array.isArray(res.body.subjects)).toBe(true)
  })

  it("leaves a room and stops the live session", async () => {
    const s = await studentSession("leaver1")
    const created = await s.post("/api/study/rooms", { name: "bye", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    await s.post("/api/study/session/start", { roomId })
    const left = await s.post(`/api/study/rooms/${roomId}/leave`, {})
    expect(left.status).toBe(200)
    const active = await s.get("/api/study/session/active")
    expect(active.body.session).toBeNull()
    const rows = await db.select().from(studyMembers).where(eq(studyMembers.roomId, roomId)).all()
    expect(rows).toHaveLength(0)
  })

  it("requires auth everywhere", async () => {
    const { http } = await import("./helpers.js")
    expect((await http.get("/api/study/overview")).status).toBe(401)
    expect((await http.get("/api/study/rooms")).status).toBe(401)
    expect((await http.post("/api/study/rooms").send({})).status).toBe(401)
  })

  it("cascades room deletion to members", async () => {
    const s = await studentSession("cascade1")
    const created = await s.post("/api/study/rooms", { name: "gone", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    await db.delete(studyRooms).where(eq(studyRooms.id, roomId)).run()
    const rows = await db.select().from(studyMembers).where(eq(studyMembers.roomId, roomId)).all()
    expect(rows).toHaveLength(0)
  })
})
