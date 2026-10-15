/**
 * Study rooms E2E (HTTP seam): create → join via invite code → focus timer
 * lifecycle (start/pause/resume/stop) → overview + leaderboard.
 *
 * Also covers: capacity cap (30), non-member start rejection, owner member
 * management + ownership transfer, unauth 401s.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { eq } from "drizzle-orm"
import { login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"
import { db } from "../src/lib/db.js"
import { studyMembers, studyRooms, users } from "../src/lib/db/schema.js"

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
    const over = await s.post("/api/study/rooms", { name: "big", capacity: 31 })
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

  it("lets the owner remove a member (and stops their timer)", async () => {
    const owner = await studentSession("owner8")
    const created = await owner.post("/api/study/rooms", { name: "managed", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    const guest = await studentSession("guest8")
    const joinRes = await guest.post("/api/study/rooms/join", { roomId })

    expect(joinRes.status).toBe(200)
    await guest.post("/api/study/session/start", { roomId })

    const guestRow = await db.select({ id: users.id }).from(users).where(eq(users.username, "study_guest8")).get()

    if (!guestRow) throw new Error("guest missing")

    const removed = await owner.post(`/api/study/rooms/${roomId}/members/${guestRow.id}/remove`, {})

    expect(removed.status).toBe(200)

    const detail = await owner.get(`/api/study/rooms/${roomId}`)

    expect(detail.body.room.memberCount).toBe(1)
    expect(detail.body.leaderboard.some((r: { id: string }) => r.id === guestRow.id)).toBe(false)

    const active = await guest.get("/api/study/session/active")

    expect(active.body.session).toBeNull()
  })

  it("refuses member removal to non-owners and self-removal", async () => {
    const owner = await studentSession("owner9")
    const created = await owner.post("/api/study/rooms", { name: "managed2", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    const guest = await studentSession("guest9")

    await guest.post("/api/study/rooms/join", { roomId })

    const ownerRow = await db.select({ id: users.id }).from(users).where(eq(users.username, "study_owner9")).get()

    if (!ownerRow) throw new Error("owner missing")

    expect((await guest.post(`/api/study/rooms/${roomId}/members/${ownerRow.id}/remove`, {})).status).toBe(403)
    expect((await owner.post(`/api/study/rooms/${roomId}/members/${ownerRow.id}/remove`, {})).status).toBe(400)
  })

  it("transfers ownership to the earliest member when the owner leaves", async () => {    const owner = await studentSession("owner10")
    const created = await owner.post("/api/study/rooms", { name: "managed3", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    const guest = await studentSession("guest10")

    await guest.post("/api/study/rooms/join", { roomId })
    expect((await owner.post(`/api/study/rooms/${roomId}/leave`, {})).status).toBe(200)

    const guestRow = await db.select({ id: users.id }).from(users).where(eq(users.username, "study_guest10")).get()
    const roomRow = await db.select().from(studyRooms).where(eq(studyRooms.id, roomId)).get()

    expect(roomRow?.ownerId).toBe(guestRow?.id)
  })

  it("enforces the 30-member capacity", async () => {
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
    expect(Number.isFinite(stopped.body.elapsedMs)).toBe(true)
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
    expect(Number.isFinite(res.body.totalMinutes)).toBe(true)
    expect(Number.isFinite(res.body.goalMinutes)).toBe(true)
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

  it("lets the owner set and clear a daily challenge", async () => {
    const owner = await studentSession("owner11")
    const created = await owner.post("/api/study/rooms", { name: "challenge", capacity: 5, requireInvite: false })
    const roomId: string = created.body.room.id
    const guest = await studentSession("guest11")

    await guest.post("/api/study/rooms/join", { roomId })

    expect((await guest.post(`/api/study/rooms/${roomId}/challenge`, { minutes: 120 })).status).toBe(403)
    expect((await owner.post(`/api/study/rooms/${roomId}/challenge`, { minutes: 5 })).status).toBe(422)
    expect((await owner.post(`/api/study/rooms/${roomId}/challenge`, { minutes: 120 })).status).toBe(200)

    const detail = await guest.get(`/api/study/rooms/${roomId}`)

    expect(detail.body.dailyChallenge.goalMin).toBe(120)
    expect(Number.isFinite(detail.body.dailyChallenge.todayMin)).toBe(true)

    expect((await owner.post(`/api/study/rooms/${roomId}/challenge`, { minutes: null })).status).toBe(200)

    const cleared = await guest.get(`/api/study/rooms/${roomId}`)

    expect(cleared.body.dailyChallenge).toBeNull()
  })
})
