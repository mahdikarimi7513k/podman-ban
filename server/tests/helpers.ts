/**
 * HTTP-seam test helpers: real users in the test DB, real cookie sessions,
 * real CSRF round-trips — the same path an attacker takes.
 */
import request from "supertest"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { buildApp } from "../src/app.js"
import { db } from "../src/lib/db.js"
import { users } from "../src/lib/db/schema.js"

export const app = buildApp()
/** supertest wrapper — the only correct way to drive an express app. */
export const http = {
  get: (url: string) => request(app).get(url),
  post: (url: string) => request(app).post(url),
  put: (url: string) => request(app).put(url),
  patch: (url: string) => request(app).patch(url),
  delete: (url: string) => request(app).delete(url),
}

export const PASSWORD = "Test-Pass-123"

let ipCounter = 1

/** Login and capture { cookies, csrf } plus authed method helpers. */
export async function login(username: string, password: string) {
  // Unique spoofed source per login (TRUST_PROXY=true): keeps the real
  // rate-limit control active without tests throttling each other.
  const ip = `10.10.${(ipCounter = (ipCounter + 1) % 250)}.7`
  const res = await http
    .post("/api/auth/login")
    .set("X-Forwarded-For", ip)
    .send({ username, password })
  if (res.status !== 200)
    throw new Error(
      `login failed for ${username}: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`,
    )
  const setCookie = res.headers["set-cookie"] as unknown as string[]
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .map((c) => c.split(";")[0])
    .join("; ")
  const csrfPair = cookies.split("; ").find((c) => c.startsWith("pb_csrf="))
  const csrf = csrfPair?.split("=")[1]
  return {
    cookies,
    csrf,
    raw: cookies ? { Cookie: cookies } : {},
    get: (url: string) =>
      request(app).get(url).set("Cookie", cookies),
    post: (url: string, body?: unknown) =>
      request(app).post(url).set("Cookie", cookies).set("X-CSRF-Token", csrf ?? "").send(body),
    put: (url: string, body?: unknown) =>
      request(app).put(url).set("Cookie", cookies).set("X-CSRF-Token", csrf ?? "").send(body),
    patch: (url: string, body?: unknown) =>
      request(app).patch(url).set("Cookie", cookies).set("X-CSRF-Token", csrf ?? "").send(body),
    delete: (url: string) =>
      request(app).delete(url).set("Cookie", cookies).set("X-CSRF-Token", csrf ?? ""),
  }
}

/** Idempotent user creation with the fixture password. */
export async function ensureUser(
  username: string,
  role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN",
  field: "FANI_HERFEI" | "KARDANESH",
) {
  const hash = await bcrypt.hash(PASSWORD, 4)
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash: hash, role, field })
      .where(eq(users.id, existing.id))
      .run()
    return db.select().from(users).where(eq(users.id, existing.id)).get()
  }
  return db
    .insert(users)
    .values({ username, name: username, passwordHash: hash, field, role })
    .returning()
    .get()
}
