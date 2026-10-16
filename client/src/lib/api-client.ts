/**
 * Client API helper.
 *
 * Security responsibilities:
 *  - credentials: "include" so the httpOnly auth cookies are sent same-origin.
 *  - Mutations (POST/PUT/PATCH/DELETE) carry the X-CSRF-Token header, read
 *    from the pb_csrf cookie (which is intentionally NOT httpOnly).
 *  - On 401, transparently call /api/auth/refresh once and retry the request
 *    with the new access token. Refresh is best-effort; on failure the app
 *    shell re-shows the auth view.
 *
 * Tokens themselves NEVER touch JS-readable storage. localStorage is never used
 * for auth — by design.
 *
 * Capacitor/APK: VITE_API_BASE points at the real API origin
 * (e.g. https://azmon.example.ir). Empty means same-origin (web behavior).
 */

import { isNativeApp } from "@/lib/native-notify"

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")

export { API_BASE }

/**
 * Default network timeout. On flaky networks a request can hang forever
 * (no bytes, no error) — without this, boot and every view would spin
 * indefinitely instead of failing fast into the offline/error UI.
 * Uploads opt out via their own longer signal (see apiUpload).
 */
export const DEFAULT_TIMEOUT_MS = 20000

export const UPLOAD_TIMEOUT_MS = 120000

function readCsrfCookie(): string | null {
  const raw = document.cookie

  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=")

    if (k === "pb_csrf") return decodeURIComponent(v.join("="))
  }

  return null
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

let refreshing: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })

      return res.ok
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

/**
 * Public session refresh for non-fetch channels (the chat socket): after a
 * drop, the httpOnly access cookie may have expired while refresh is still
 * valid — renewing before the socket retries breaks the disconnect loop.
 */
export function refreshSession(): Promise<boolean> {
  return doRefresh()
}

type SessionDeadHandler = () => void

let deadHandler: SessionDeadHandler | null = null

let lastDeadNotify = 0

/** The app shell registers its sign-out here (avoids a store import cycle). */
export function onSessionDead(handler: SessionDeadHandler): void {
  deadHandler = handler
}

type SiteLockedHandler = () => void

let lockedHandler: SiteLockedHandler | null = null

let lastLockedNotify = 0

/** The app shell refreshes remote config here so an admin lock lands promptly. */
export function onSiteLocked(handler: SiteLockedHandler): void {
  lockedHandler = handler
}

/**
 * A 401 that survived a refresh means the session itself is gone (deleted
 * account, password change, 30-day expiry). Verify once with a raw /me
 * (no retry, no recursion) and notify at most every 30s.
 */
async function checkSessionDead(input: string): Promise<void> {
  if (!deadHandler) return

  if (input.includes("/api/auth/")) return

  if (Date.now() - lastDeadNotify < 30_000) return

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
      signal: AbortSignal.timeout(8000),
    })

    if (res.status === 401) {
      lastDeadNotify = Date.now()
      deadHandler()
    }
  } catch {
    /* offline — not a dead session */
  }
}

export async function apiFetch<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase()
  const isMutation = method !== "GET" && method !== "HEAD"

  const headers = new Headers(init.headers)

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }

  if (isMutation) {
    const csrf = readCsrfCookie()

    if (csrf) headers.set("x-csrf-token", csrf)
  }

  // Caller-provided signal wins (uploads pass a longer one); otherwise fail
  // fast instead of hanging forever on a stalled connection.
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS)

  const doFetch = () =>
    fetch(`${API_BASE}${input}`, { ...init, headers, credentials: "include", signal })

  let res: Response

  try {
    res = await doFetch()
  } catch (err) {
    const aborted =
      err instanceof DOMException
        ? err.name === "AbortError"
        : err instanceof Error && err.name === "AbortError"

    if (aborted) {
      throw new ApiError("اتصال اینترنت کند است یا قطع شده — دوباره تلاش کنید", 0, null)
    }

    throw err
  }

  // Expired access token → try one refresh, then retry.
  // refreshFailed tracks a dead refresh (deleted user, 30d expiry,
  // password change): retrying further is pointless, and the session is
  // over — the owner below sends the user back to login instead of
  // leaving them in a dead session that 401s forever.
  let refreshFailed = false

  if (res.status === 401 && isMutation === false) {
    // GET 401 → maybe access expired
    const ok = await doRefresh()

    if (ok) res = await doFetch()
    else refreshFailed = true
  } else if (res.status === 401 && isMutation) {
    // For mutations we still try refresh once (CSRF may survive since user id stable).
    const ok = await doRefresh()

    if (ok) {
      // re-read csrf (should be unchanged) and retry
      const csrf = readCsrfCookie()

      if (csrf) headers.set("x-csrf-token", csrf)
      res = await doFetch()
    } else {
      refreshFailed = true
    }
  }

  if (!res.ok) {
    if (res.status === 401 && refreshFailed) void checkSessionDead(input)

    let body: unknown = null

    try {
      body = await res.json()
    } catch {
      /* ignore */
    }

    // Admin locked the site mid-session: pull fresh config so the
    // maintenance screen replaces the app instead of 503-spinning.
    // Throttled — every poll/fetch would otherwise refetch config.
    if (
      res.status === 503 &&
      lockedHandler &&
      Date.now() - lastLockedNotify > 5_000 &&
      body &&
      typeof body === "object" &&
      (body as { code?: unknown }).code === "SITE_LOCKED"
    ) {
      lastLockedNotify = Date.now()
      lockedHandler()
    }

    let message = `خطای ${res.status}`

    if (body && typeof body === "object" && "error" in body) {
      const serverError = (body as Record<string, unknown>).error

      if (typeof serverError === "string" && serverError) message = serverError
    }

    throw new ApiError(message, res.status, body)
  }

  return res.json() as Promise<T>
}

/**
 * Upload a raw file body (application/octet-stream) with CSRF + auth cookies.
 * Used for archive artifact uploads; server answers with JSON.
 *
 * On the native app the body goes base64-encoded: the Capacitor bridge cannot
 * transport ArrayBuffer bodies losslessly (binary uploads arrive truncated or
 * mangled), while strings survive. The server decodes on
 * `x-transfer-encoding: base64`. Web keeps sending raw bytes.
 */
export async function apiUpload<T = unknown>(input: string, file: File): Promise<T> {
  // Large files on slow networks need far longer than the default timeout.
  const signal = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)

  if (isNativeApp()) {
    return apiFetch<T>(
      input,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
          "x-transfer-encoding": "base64",
        },
        body: await fileToBase64(file),
        signal,
      },
    )
  }

  const bytes = await file.arrayBuffer()

  return apiFetch<T>(
    input,
    {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
      },
      body: bytes,
      signal,
    },
  )
}

// (isNativeApp lives in @/lib/native-notify — single source; the inline
// copy that used to be here was removed to stop the two drifting apart.)

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Chunked: btoa on one giant string blows the call stack past ~100k chars.
  let bin = ""
  const CHUNK = 0x8000

  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }

  return btoa(bin)
}
