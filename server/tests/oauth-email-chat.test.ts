/**
 * Seam: login email, OAuth2 social login, and chat rate limiting.
 *
 * OAuth provider HTTP is pointed at a local stub server (env-overridable
 * base URLs in the implementation) — real HTTP, no module mocking.
 * State/ticket rows are inserted directly; the signed pending cookie is
 * minted with the real signer.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createHash } from "crypto"
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http"
import { eq } from "drizzle-orm"
import { db } from "../src/lib/db.js"
import { chatMessages, oauthStates, users } from "../src/lib/db/schema.js"
import { http, login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"
import {
  signPendingProfile,
  verifyPendingProfile,
  pkceChallenge,
  pickGithubEmail,
  stateMode,
  issueTicket,
} from "../src/lib/auth/oauth.js"

beforeAll(ensureFixtures)

let emailCounter = 0

const uniqEmail = (): string => {
  emailCounter += 1

  return `oauth${Date.now() % 1000000}-${emailCounter}@mail.com`
}

let userCounter = 0

const uniqUser = (p: string): string => {
  userCounter += 1

  return `${p}${Date.now() % 1000000}${userCounter}`
}

async function gateOpen(open: boolean): Promise<void> {
  const admin = await login("sec_admin", PASSWORD)

  await admin.put("/api/admin/config").send({ registrationOpen: open })
}

function jarOf(res: { headers: { [key: string]: string | string[] | undefined } }): string {
  const raw = res.headers["set-cookie"]
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]

  return list.map((c) => c.split(";")[0]).join("; ")
}

function cookieOf(jar: string, name: string): string {
  return jar
    .split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1) ?? ""
}

describe("login email", () => {
  it("rejects missing and malformed addresses with 422", async () => {
    await gateOpen(true)

    const missing = await http
      .post("/api/auth/register")
      .set("X-Forwarded-For", "10.31.0.1")
      .send({ name: "ایمیل", username: uniqUser("nomail"), password: "NoMail-123", field: "FANI_HERFEI" })

    expect(missing.status).toBe(422)

    for (const bad of ["plain", "a@b", "a@b.", "@x.com", "a@b@c.com"]) {
      const res = await http
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.31.0.2")
        .send({ name: "ایمیل", username: uniqUser("badmail"), password: "BadMail-123", email: bad, field: "FANI_HERFEI" })

      expect(res.status).toBe(422)
    }
  })

  it("rejects a second account on the same email everywhere", async () => {
    await gateOpen(true)
    const admin = await login("sec_admin", PASSWORD)
    const dup = uniqEmail()

    const first = await http
      .post("/api/auth/register")
      .set("X-Forwarded-For", "10.31.0.3")
      .send({ name: "اول", username: uniqUser("emaildup"), password: "DupMail-123", email: dup, field: "FANI_HERFEI" })

    expect(first.status).toBe(201)

    const second = await http
      .post("/api/auth/register")
      .set("X-Forwarded-For", "10.31.0.4")
      .send({ name: "دوم", username: uniqUser("emaildup"), password: "DupMail-123", email: dup, field: "KARDANESH" })

    expect(second.status).toBe(409)

    // Admin-created users hit the same wall.
    const viaAdmin = await admin
      .post("/api/admin/users")
      .send({ name: "ادمین", username: uniqUser("emaildup"), password: "DupMail-123", email: dup, field: "FANI_HERFEI" })

    expect(viaAdmin.status).toBe(409)

    // External register answers with a machine-readable code.
    const issued = await admin.post("/api/admin/external-api/key")
    const key = String(issued.body.apiKey)

    try {
      const viaExt = await http
        .post("/api/external/register")
        .set("x-api-key", key)
        .send({ name: "خارجی", username: uniqUser("emaildup"), password: "DupMail-123", email: dup, field: "FANI_HERFEI" })

      expect(viaExt.status).toBe(409)

      expect(viaExt.body.code).toBe("EMAIL_TAKEN")
    } finally {
      await admin.delete("/api/admin/external-api/key")
    }
  })
})

describe("oauth pure helpers", () => {
  it("computes the RFC 7636 appendix-B vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    )
  })

  it("picks the primary verified github address", () => {
    expect(
      pickGithubEmail([
        { email: "a@mail.com", primary: true, verified: false },
        { email: "b@mail.com", primary: false, verified: true },
      ]),
    ).toBe("b@mail.com")

    expect(
      pickGithubEmail([{ email: "P@mail.com", primary: true, verified: true }]),
    ).toBe("p@mail.com")

    expect(pickGithubEmail([{ email: "a@mail.com", verified: false }])).toBeNull()

    expect(pickGithubEmail("nope")).toBeNull()
  })

  it("reads the mode suffix off the state token", () => {
    expect(stateMode("abc.native")).toBe("native")

    expect(stateMode("abc.web")).toBe("web")

    expect(stateMode("abc")).toBe("web")
  })

  it("round-trips the signed pending profile and rejects tampering", () => {
    const profile = { provider: "google" as const, sub: "s1", email: "P@mail.com", name: "P" }
    const token = signPendingProfile(profile)
    const back = verifyPendingProfile(token)

    expect(back).toEqual({ provider: "google", sub: "s1", email: "p@mail.com", name: "P" })

    expect(verifyPendingProfile(token.slice(0, -2) + "xx")).toBeNull()

    expect(verifyPendingProfile("garbage")).toBeNull()
  })
})

describe("oauth tickets and pending completion", () => {
  it("consumes a ticket once, then rejects reuse and expiry", async () => {
    const me = await ensureUser("ticket_user", "STUDENT", "FANI_HERFEI")

    if (!me) throw new Error("fixture failed")

    const ticket = await issueTicket(me.id, null)
    const first = await http.post("/api/auth/oauth/consume").send({ ticket })

    expect(first.status).toBe(200)

    expect(first.body.user.id).toBe(me.id)

    const replay = await http.post("/api/auth/oauth/consume").send({ ticket })

    expect(replay.status).toBe(401)

    const stale = await issueTicket(me.id, null, -1)
    const gone = await http.post("/api/auth/oauth/consume").send({ ticket: stale })

    expect(gone.status).toBe(401)

    const missing = await http.post("/api/auth/oauth/consume").send({ ticket: "nope" })

    expect(missing.status).toBe(401)
  })

  it("completes a pending signup even with the gate closed (by design)", async () => {
    await gateOpen(false)

    try {
      const email = uniqEmail()
      const token = signPendingProfile({ provider: "github", sub: "gh-pending-1", email, name: "Pending One" })

      const res = await http
        .post("/api/auth/oauth/complete")
        .set("Cookie", `pb_oauth_pending=${token}`)
        .send({ field: "KARDANESH" })

      expect(res.status).toBe(201)

      expect(res.body.user.field).toBe("KARDANESH")

      // The fresh session works immediately.
      const me = await http.get("/api/auth/me").set("Cookie", jarOf(res))

      expect(me.status).toBe(200)
    } finally {
      await gateOpen(true)
    }
  })

  it("links to the matching manual account instead of duplicating it", async () => {
    await gateOpen(true)
    const admin = await login("sec_admin", PASSWORD)
    const email = uniqEmail()

    const created = await admin
      .post("/api/admin/users")
      .send({ name: "لینک", username: uniqUser("linkme"), password: "LinkMe-123", email, field: "FANI_HERFEI" })

    expect(created.status).toBe(201)

    const token = signPendingProfile({ provider: "google", sub: "g-link-1", email, name: "لینک" })

    const res = await http
      .post("/api/auth/oauth/complete")
      .set("Cookie", `pb_oauth_pending=${token}`)
      .send({ field: "KARDANESH" })

    // Same account (field unchanged), linked — not a second row.

    expect(res.status).toBe(200)

    expect(res.body.user.id).toBe(created.body.user.id)

    const row = await db.select().from(users).where(eq(users.id, created.body.user.id)).get()

    expect(row?.googleSub).toBe("g-link-1")
  })

  it("carries a pending ticket through consume into complete", async () => {
    await gateOpen(true)
    const email = uniqEmail()
    const ticket = await issueTicket(null, { provider: "google", sub: "g-chain-1", email, name: "Chain One" })

    const consumed = await http.post("/api/auth/oauth/consume").send({ ticket })

    expect(consumed.status).toBe(200)

    expect(consumed.body.pending.email).toBe(email)

    const jar = jarOf(consumed)

    expect(cookieOf(jar, "pb_oauth_pending").length).toBeGreaterThan(10)

    const done = await http
      .post("/api/auth/oauth/complete")
      .set("Cookie", jar)
      .send({ field: "FANI_HERFEI" })

    expect(done.status).toBe(201)
  })
})

// ---- stub provider (real HTTP, no mocking) ------------------------------

interface StubGoogle {
  sub: string
  email: string
  email_verified: boolean
  name: string
}

interface StubGithubUser {
  id: number
  login: string
  name: string
}

interface StubGithubEmail {
  email: string
  primary: boolean
  verified: boolean
}

interface StubProfile {
  google: StubGoogle
  githubUser: StubGithubUser
  githubEmails: StubGithubEmail[]
}

const stubProfile: StubProfile = {
  google: { sub: "stub-g-1", email: "stub1@mail.com", email_verified: true, name: "Stub One" },
  githubUser: { id: 424242, login: "octo", name: "Octo Cat" },
  githubEmails: [
    { email: "hidden@mail.com", primary: true, verified: false },
    { email: "octo@mail.com", primary: false, verified: true },
  ],
}

let stub: Server | null = null

const savedEnv: Record<string, string | undefined> = {}

function stubUrl(path: string): string {
  if (!stub) throw new Error("stub not listening")

  const addr = stub.address()

  if (!addr || !("port" in addr)) throw new Error("stub not listening")

  return `http://127.0.0.1:${addr.port}${path}`
}

function setStubEnv(): void {
  const keys = [
    "OAUTH_GOOGLE_TOKEN_URL",
    "OAUTH_GOOGLE_USERINFO_URL",
    "OAUTH_GITHUB_TOKEN_URL",
    "OAUTH_GITHUB_USER_URL",
    "OAUTH_GITHUB_EMAILS_URL",
  ] as const

  for (const k of keys) savedEnv[k] = process.env[k]

  process.env.OAUTH_GOOGLE_TOKEN_URL = stubUrl("/gtoken")
  process.env.OAUTH_GOOGLE_USERINFO_URL = stubUrl("/guser")
  process.env.OAUTH_GITHUB_TOKEN_URL = stubUrl("/ghtoken")
  process.env.OAUTH_GITHUB_USER_URL = stubUrl("/ghuser")
  process.env.OAUTH_GITHUB_EMAILS_URL = stubUrl("/ghemails")
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

type StubReply =
  | StubGoogle
  | StubGithubUser
  | StubGithubEmail[]
  | { access_token: string }
  | { error: string }

function reply(res: ServerResponse, obj: StubReply, status = 200): void {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(obj))
}

async function insertState(state: string, mode: "web" | "native"): Promise<void> {
  await db.insert(oauthStates).values({
    stateHash: createHash("sha256").update(state, "utf8").digest("hex"),
    verifier: "test-verifier",
    mode,
    expiresAt: new Date(Date.now() + 600_000),
  }).run()
}

describe("oauth callback via stub provider", () => {
  beforeAll(async () => {
    stub = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ""

      if (url.startsWith("/gtoken") || url.startsWith("/ghtoken")) {
        reply(res, { access_token: "stub-at" })

        return
      }

      if (url.startsWith("/guser")) {
        reply(res, stubProfile.google)

        return
      }

      if (url.startsWith("/ghuser")) {
        reply(res, stubProfile.githubUser)

        return
      }

      if (url.startsWith("/ghemails")) {
        reply(res, stubProfile.githubEmails)

        return
      }

      reply(res, { error: "unknown" }, 404)
    })

    await new Promise<void>((resolve) => stub?.listen(0, "127.0.0.1", resolve))
    setStubEnv()
  })

  afterAll(async () => {
    restoreEnv()

    await new Promise<void>((resolve) => stub?.close(() => resolve()))
  })

  it("google web callback parks a new address as pending and redirects home", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id"
    process.env.GOOGLE_CLIENT_SECRET = "test-secret"

    try {
      const state = `cbstate1.web`
      await insertState(state, "web")

      const res = await http.get(
        `/api/auth/oauth/google/callback?code=stubcode&state=${encodeURIComponent(state)}`,
      )

      expect(res.status).toBe(302)

      expect(res.headers.location).toBe("/")

      expect(cookieOf(jarOf(res), "pb_oauth_pending").length).toBeGreaterThan(10)
    } finally {
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
    }
  })

  it("google rejects unverified addresses without parking anything", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id"
    process.env.GOOGLE_CLIENT_SECRET = "test-secret"
    const prev = stubProfile.google
    stubProfile.google = { sub: "stub-g-9", email: "unv@mail.com", email_verified: false, name: "Unv" }

    try {
      const state = `cbstate2.web`
      await insertState(state, "web")

      const res = await http.get(
        `/api/auth/oauth/google/callback?code=stubcode&state=${encodeURIComponent(state)}`,
      )

      expect(res.status).toBe(422)

      expect(cookieOf(jarOf(res), "pb_oauth_pending")).toBe("")
    } finally {
      stubProfile.google = prev
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
    }
  })

  it("github native callback returns a ticket over the app scheme", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id"
    process.env.GITHUB_CLIENT_SECRET = "test-secret"

    try {
      const state = `cbstate3.native`
      await insertState(state, "native")

      const res = await http.get(
        `/api/auth/oauth/github/callback?code=stubcode&state=${encodeURIComponent(state)}`,
      )

      expect(res.status).toBe(302)
      const location = String(res.headers.location ?? "")

      // Verified non-primary address is picked (see stubProfile above).

      expect(location).toContain("ir.payamcoder.podmanban://oauth?ticket=")
    } finally {
      delete process.env.GITHUB_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET
    }
  })

  it("a used state cannot be replayed", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id"
    process.env.GOOGLE_CLIENT_SECRET = "test-secret"

    try {
      const state = `cbstate4.web`
      await insertState(state, "web")
      const url = `/api/auth/oauth/google/callback?code=stubcode&state=${encodeURIComponent(state)}`

      const first = await http.get(url)

      expect(first.status).toBe(302)

      const replay = await http.get(url)

      expect(replay.status).toBe(401)
    } finally {
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET
    }
  })
})

describe("chat rate limit", () => {
  it("trips to 429 on message floods, per sender", async () => {
    const spam = await ensureUser("chat_spam", "STUDENT", "FANI_HERFEI")

    if (!spam) throw new Error("fixture failed")

    const authed = await login("chat_spam", PASSWORD)
    let tripped = false
    let lastStatus = 0

    for (let i = 0; i < 35; i++) {
      const res = await authed.post("/api/support/messages", { text: `spam ${i}` })
      lastStatus = res.status

      if (res.status === 429) {
        tripped = true

        expect(Number.isInteger(res.body.retryAfterSec)).toBe(true)
        break
      }

      expect(res.status).toBe(201)
    }

    expect(tripped).toBe(true)

    expect(lastStatus).toBe(429)

    await db.delete(chatMessages).where(eq(chatMessages.userId, spam.id)).run()
  })

  it("a quiet user still sends fine afterwards", async () => {
    const authed = await login("sec_student", PASSWORD)
    const res = await authed.post("/api/support/messages", { text: "سلام، یک سوال داشتم" })

    expect(res.status).toBe(201)

    const row = await db.select().from(chatMessages).where(eq(chatMessages.id, res.body.message.id)).get()

    if (row) {
      await db.delete(chatMessages).where(eq(chatMessages.id, row.id)).run()
    }
  })
})
