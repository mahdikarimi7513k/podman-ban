/**
 * OAuth2 social login (Google + GitHub), authorization-code flow with PKCE.
 *
 * Why this shape:
 *  - Google refuses embedded WebViews (disallowed_useragent), so the APK
 *    opens the provider in the SYSTEM browser (@capacitor/browser) — a
 *    different cookie jar. The PKCE verifier and the state token therefore
 *    live SERVER-side (OauthState rows, 10min TTL), never in cookies, so
 *    web and native share exactly one code path.
 *  - The native return cannot carry cookies back into the WebView, so the
 *    callback mints a single-use ticket (5min TTL) and redirects to the
 *    app scheme; the app POSTs it to /consume from inside the WebView,
 *    where issueSession can set the real httpOnly cookies.
 *  - New social users still need a study field (NOT NULL column), so their
 *    verified profile waits in a short-lived HMAC-signed cookie (web) or
 *    a pending ticket (native) until they pick one in POST /complete.
 *    Social signup bypasses the public registration gate BY DESIGN
 *    (a verified provider email is the trust anchor) — like admin-created
 *    users.
 *  - Linking is by verified email: a Google/GitHub account whose verified
 *    address matches an existing user LINKS to it (provider sub stored)
 *    instead of failing — manual signup first, social button later just
 *    logs in. An UNVERIFIED provider email is rejected, never trusted.
 *
 * No new npm dependencies: token exchange + profiles are plain fetch
 * calls (Node 20+) validated with zod at the boundary. Provider base URLs
 * are env-overridable so tests can point them at a local stub.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"
import { z } from "zod"
import { and, eq, isNull, lt } from "drizzle-orm"
import { db } from "../db.js"
import { oauthStates, oauthTickets, users } from "../db/schema.js"

export type OAuthProvider = "google" | "github"

export type OAuthMode = "web" | "native"

export interface OAuthProfile {
  provider: OAuthProvider
  sub: string
  email: string
  name: string
}

export class OAuthError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

function env(name: string): string | undefined {
  const v = process.env[name]

  return v && v.length > 0 ? v : undefined
}

function isProvider(v: string): v is OAuthProvider {
  return v === "google" || v === "github"
}

export function parseProvider(v: string): OAuthProvider | null {
  return isProvider(v) ? v : null
}

function parseMode(suffix: string): OAuthMode {
  return suffix === "native" ? "native" : "web"
}

/** Both client id AND secret must be set, otherwise the provider is off. */
export function oauthEnabled(provider: OAuthProvider): boolean {
  if (provider === "google") return !!env("GOOGLE_CLIENT_ID") && !!env("GOOGLE_CLIENT_SECRET")

  return !!env("GITHUB_CLIENT_ID") && !!env("GITHUB_CLIENT_SECRET")
}

/** Public capability flags for /api/config (no secrets leak here). */
export function oauthProviders() {
  return { google: oauthEnabled("google"), github: oauthEnabled("github") }
}

/** Custom scheme the native app listens on (defaults to the APK appId). */
export function oauthAppScheme(): string {
  return env("OAUTH_APP_SCHEME") ?? "ir.payamcoder.podmanban"
}

function baseUrl(req: { protocol: string; get(h: string): string | undefined }): string {
  const fromEnv = env("OAUTH_BASE_URL")

  if (fromEnv) return fromEnv.replace(/\/$/, "")

  const host = req.get("host") ?? "localhost"

  return `${req.protocol}://${host}`
}

export function redirectUri(provider: OAuthProvider, req: { protocol: string; get(h: string): string | undefined }): string {
  return `${baseUrl(req)}/api/auth/oauth/${provider}/callback`
}

// ---- PKCE (RFC 7636, S256) -------------------------------------------

/** 64 random bytes → 128 hex chars (PKCE allows 43..128). */
export function newVerifier(): string {
  return randomBytes(64).toString("hex")
}

/** base64url(sha256(verifier)) — the only thing the provider ever sees. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export function newStateToken(): string {
  return randomBytes(32).toString("hex")
}

// The mode rides along in the state token itself (`<hex>.<mode>`): the
// callback must route failures (native → app scheme, web → JSON) even
// when the state row is already gone. Flipping the suffix only affects
// the attacker's own redirect target — the row lookup still gates auth.
export function stateMode(state: string): OAuthMode {
  return parseMode(state.slice(state.lastIndexOf(".") + 1))
}

export function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

// ---- provider payload contracts (parsed at the boundary) ----------------

const googleTokenSchema = z.object({
  access_token: z.string().min(1),
})

const googleUserinfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.boolean(),
  name: z.string().optional(),
})

const githubTokenSchema = z.object({
  access_token: z.string().min(1),
})

const githubUserSchema = z.object({
  id: z.union([z.number(), z.string()]),
  login: z.string().optional(),
  name: z.string().nullish(),
})

const githubEmailSchema = z.object({
  email: z.string(),
  primary: z.boolean(),
  verified: z.boolean(),
})

const githubEmailsSchema = z.array(githubEmailSchema)

type GithubEmail = z.infer<typeof githubEmailSchema>

const pendingProfileSchema = z.object({
  provider: z.enum(["google", "github"]),
  sub: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
})

// ---- start records (server-side, shared web + native) ------------------

export const OAUTH_STATE_TTL_MIN = 10

export const OAUTH_TICKET_TTL_MIN = 5

export interface OAuthStart {
  state: string
  url: string
}

function googleUrls() {
  return {
    auth: env("OAUTH_GOOGLE_AUTH_URL") ?? "https://accounts.google.com/o/oauth2/v2/auth",
    token: env("OAUTH_GOOGLE_TOKEN_URL") ?? "https://oauth2.googleapis.com/token",
    userinfo: env("OAUTH_GOOGLE_USERINFO_URL") ?? "https://openidconnect.googleapis.com/v1/userinfo",
  }
}

function githubUrls() {
  return {
    auth: env("OAUTH_GITHUB_AUTH_URL") ?? "https://github.com/login/oauth/authorize",
    token: env("OAUTH_GITHUB_TOKEN_URL") ?? "https://github.com/login/oauth/access_token",
    user: env("OAUTH_GITHUB_USER_URL") ?? "https://api.github.com/user",
    emails: env("OAUTH_GITHUB_EMAILS_URL") ?? "https://api.github.com/user/emails",
  }
}

export function buildAuthUrl(
  provider: OAuthProvider,
  req: { protocol: string; get(h: string): string | undefined },
  state: string,
  challenge: string,
): string {
  const redirect = redirectUri(provider, req)

  if (provider === "google") {
    const q = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID") ?? "",
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })

    return `${googleUrls().auth}?${q.toString()}`
  }

  const q = new URLSearchParams({
    client_id: env("GITHUB_CLIENT_ID") ?? "",
    redirect_uri: redirect,
    scope: "user:email",
    state,
  })

  return `${githubUrls().auth}?${q.toString()}`
}

/**
 * Persist a start record and return the provider URL. Old/expired rows
 * are swept on every start so the table stays tiny under start-spam.
 */
export async function createOAuthStart(
  provider: OAuthProvider,
  req: { protocol: string; get(h: string): string | undefined },
  mode: OAuthMode,
): Promise<OAuthStart> {
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date())).run()

  const state = `${newStateToken()}.${mode}`
  const verifier = newVerifier()

  await db.insert(oauthStates).values({
    stateHash: sha256hex(state),
    verifier,
    mode,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MIN * 60_000),
  }).run()

  return { state, url: buildAuthUrl(provider, req, state, pkceChallenge(verifier)) }
}

export interface ConsumedState {
  verifier: string
  mode: OAuthMode
}

/**
 * Validate the returned state and consume it (single-use: deleted).
 * Null = unknown, expired, or already used → re-run the flow.
 */
export async function consumeOAuthState(state: string): Promise<ConsumedState | null> {
  const row = await db
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.stateHash, sha256hex(state)))
    .get()

  if (!row) return null

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(oauthStates).where(eq(oauthStates.id, row.id)).run()

    return null
  }

  await db.delete(oauthStates).where(eq(oauthStates.id, row.id)).run()

  return { verifier: row.verifier, mode: row.mode }
}

// ---- provider exchange + verified profile ------------------------------

async function postForm<T>(
  url: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) throw new OAuthError("سرویس ورود در دسترس نیست — دوباره تلاش کنید", 502)

    raw = await res.json()
  } catch (err) {
    if (err instanceof OAuthError) throw err

    throw new OAuthError("سرویس ورود در دسترس نیست — دوباره تلاش کنید", 502)
  }

  const parsed = schema.safeParse(raw)

  if (!parsed.success) throw new OAuthError("سرویس ورود در دسترس نیست — دوباره تلاش کنید", 502)

  return parsed.data
}

async function getJson<T>(url: string, token: string, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown

  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "podman-ban-oauth" },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) throw new OAuthError("سرویس ورود در دسترس نیست — دوباره تلاش کنید", 502)

    raw = await res.json()
  } catch (err) {
    if (err instanceof OAuthError) throw err

    throw new OAuthError("سرویس ورود در دسترس نیست — دوباره تلاش کنید", 502)
  }

  const parsed = schema.safeParse(raw)

  if (!parsed.success) throw new OAuthError("سرویس ورود در دسترس نیست — دوباره تلاش کنید", 502)

  return parsed.data
}

/** Exchange the code and return the VERIFIED profile, or throw. */
export async function fetchOAuthProfile(
  provider: OAuthProvider,
  req: { protocol: string; get(h: string): string | undefined },
  code: string,
  verifier: string,
): Promise<OAuthProfile> {
  if (provider === "google") return fetchGoogleProfile(req, code, verifier)

  return fetchGithubProfile(req, code)
}

async function fetchGoogleProfile(
  req: { protocol: string; get(h: string): string | undefined },
  code: string,
  verifier: string,
): Promise<OAuthProfile> {
  const urls = googleUrls()

  const token = await postForm(
    urls.token,
    {
      code,
      client_id: env("GOOGLE_CLIENT_ID") ?? "",
      client_secret: env("GOOGLE_CLIENT_SECRET") ?? "",
      redirect_uri: redirectUri("google", req),
      grant_type: "authorization_code",
      code_verifier: verifier,
    },
    googleTokenSchema,
  )

  const me = await getJson(urls.userinfo, token.access_token, googleUserinfoSchema)

  // Never trust an unverified address: it would let anyone claim
  // someone else's account by typing their email at the provider.
  if (me.email_verified !== true) {
    throw new OAuthError("ایمیل گوگل شما تأیید نشده است — اول آن را تأیید کنید", 422)
  }

  return { provider: "google", sub: me.sub, email: me.email.toLowerCase(), name: me.name ?? me.email }
}

/** Primary+verified address wins; any verified address is the fallback. */
export function pickGithubEmail(list: GithubEmail[]): string | null {
  let fallback: string | null = null

  for (const item of list) {
    if (item.verified !== true) continue

    const email = item.email.toLowerCase()

    if (item.primary === true) return email

    fallback ??= email
  }

  return fallback
}

async function fetchGithubProfile(
  req: { protocol: string; get(h: string): string | undefined },
  code: string,
): Promise<OAuthProfile> {
  const urls = githubUrls()

  const token = await postForm(
    urls.token,
    {
      client_id: env("GITHUB_CLIENT_ID") ?? "",
      client_secret: env("GITHUB_CLIENT_SECRET") ?? "",
      code,
      redirect_uri: redirectUri("github", req),
    },
    githubTokenSchema,
  )

  const user = await getJson(urls.user, token.access_token, githubUserSchema)

  const emails = await getJson(urls.emails, token.access_token, githubEmailsSchema)

  const email = pickGithubEmail(emails)

  if (!email) {
    throw new OAuthError("ایمیل تأییدشده‌ای در گیت‌هاب شما پیدا نشد", 422)
  }

  const login = user.login ?? email
  const name = user.name ?? login

  return { provider: "github", sub: String(user.id), email, name }
}

// ---- account resolution: login, link, or pending -------------------------

export interface SessionAccount {
  id: string
  name: string
  role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN"
  field: "FANI_HERFEI" | "KARDANESH"
}

/**
 * Find the account for a verified profile:
 *  - provider sub already stored → log in,
 *  - verified email matches an account → LINK the sub, then log in
 *    (manual signup first, social button later just works),
 *  - otherwise null → the caller starts the pending (field-pick) flow.
 */
export async function resolveOAuthAccount(profile: OAuthProfile): Promise<SessionAccount | null> {
  const col = profile.provider === "google" ? users.googleSub : users.githubId

  const bySub = await db.select().from(users).where(eq(col, profile.sub)).get()

  if (bySub) {
    return { id: bySub.id, name: bySub.name, role: bySub.role, field: bySub.field }
  }

  const byEmail = await db.select().from(users).where(eq(users.email, profile.email)).get()

  if (!byEmail) return null

  if (byEmail.googleSub && profile.provider === "google" && byEmail.googleSub !== profile.sub) {
    throw new OAuthError("این حساب به هویت گوگل دیگری متصل است", 403)
  }

  if (byEmail.githubId && profile.provider === "github" && byEmail.githubId !== profile.sub) {
    throw new OAuthError("این حساب به هویت گیت‌هاب دیگری متصل است", 403)
  }

  try {
    await db.update(users).set({ [col.name]: profile.sub }).where(eq(users.id, byEmail.id)).run()
  } catch {
    // Lost a link race (UNIQUE): whoever won owns this sub — log in as them.
    const winner = await db.select().from(users).where(eq(col, profile.sub)).get()

    if (!winner) throw new OAuthError("خطای داخلی سرور", 500)

    return { id: winner.id, name: winner.name, role: winner.role, field: winner.field }
  }

  return { id: byEmail.id, name: byEmail.name, role: byEmail.role, field: byEmail.field }
}

/** Unique username derived from the email local part (login handle). */
export async function deriveUsername(email: string): Promise<string> {
  const at = email.indexOf("@")
  const raw = at === -1 ? email : email.slice(0, at)
  const base = raw.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 28) || "user"

  for (let i = 0; i < 50; i++) {
    const candidate = (i === 0 ? base : `${base}${i}`).slice(0, 32)
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).get()

    if (!exists) return candidate
  }

  return `${base.slice(0, 24)}${randomBytes(4).toString("hex")}`
}

/** Unusable password for social-created accounts (unknown random secret). */
export function randomPassword(): string {
  return randomBytes(24).toString("hex")
}

// ---- pending profiles (new social users picking a field) ------------------

function pendingSecret(): string {
  const s = process.env.CSRF_SECRET

  if (!s) throw new Error("CSRF_SECRET is not set")

  return s
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)

  if (ab.length !== bb.length) return false

  return timingSafeEqual(ab, bb)
}

/** HMAC-signed pending blob for the short-lived httpOnly cookie. */
export function signPendingProfile(profile: OAuthProfile): string {
  const payload = Buffer.from(JSON.stringify(profile)).toString("base64url")
  const sig = createHmac("sha256", pendingSecret()).update(payload).digest("base64url")

  return `${payload}.${sig}`
}

/** Null on any tamper, expiry is enforced by the cookie max-age. */
export function verifyPendingProfile(token: string): OAuthProfile | null {
  const dot = token.lastIndexOf(".")

  if (dot === -1) return null

  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac("sha256", pendingSecret()).update(payload).digest("base64url")

  if (!safeEqual(sig, expected)) return null

  let raw: unknown

  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }

  const parsed = pendingProfileSchema.safeParse(raw)

  if (!parsed.success) return null

  const p = parsed.data

  return { provider: p.provider, sub: p.sub, email: p.email.toLowerCase(), name: p.name }
}

// ---- one-time tickets (native handoff + pending over ticket) ---------------

export interface TicketRow {
  id: string
  userId: string | null
  pendingProfile: OAuthProfile | null
}

export async function issueTicket(
  userId: string | null,
  pending: OAuthProfile | null,
  ttlMin = OAUTH_TICKET_TTL_MIN,
): Promise<string> {
  const ticket = randomBytes(32).toString("hex")

  await db.insert(oauthTickets).values({
    ticketHash: sha256hex(ticket),
    userId,
    pendingProfile: pending ? JSON.stringify(pending) : null,
    expiresAt: new Date(Date.now() + ttlMin * 60_000),
  }).run()

  return ticket
}

/**
 * Single-use consume: the conditional revoke means two parallel POSTs
 * with the same ticket cannot both win (the loser gets null → 401).
 */
export async function consumeTicket(ticket: string): Promise<TicketRow | null> {
  const row = await db
    .select()
    .from(oauthTickets)
    .where(eq(oauthTickets.ticketHash, sha256hex(ticket)))
    .get()

  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null

  const revoked = await db
    .update(oauthTickets)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthTickets.id, row.id), isNull(oauthTickets.usedAt)))
    .run()

  if (revoked.changes === 0) return null

  if (!row.pendingProfile) return { id: row.id, userId: row.userId, pendingProfile: null }

  let stored: unknown

  try {
    stored = JSON.parse(row.pendingProfile)
  } catch {
    return { id: row.id, userId: row.userId, pendingProfile: null }
  }

  const parsed = pendingProfileSchema.safeParse(stored)

  if (!parsed.success) return { id: row.id, userId: row.userId, pendingProfile: null }

  const p = parsed.data

  return {
    id: row.id,
    userId: row.userId,
    pendingProfile: { provider: p.provider, sub: p.sub, email: p.email, name: p.name },
  }
}
