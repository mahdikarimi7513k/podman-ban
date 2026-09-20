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

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")

export { API_BASE }

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

  const doFetch = () =>
    fetch(`${API_BASE}${input}`, { ...init, headers, credentials: "include" })

  let res = await doFetch()

  // Expired access token → try one refresh, then retry.
  if (res.status === 401 && isMutation === false) {
    // GET 401 → maybe access expired
    const ok = await doRefresh()
    if (ok) res = await doFetch()
  } else if (res.status === 401 && isMutation) {
    // For mutations we still try refresh once (CSRF may survive since user id stable).
    const ok = await doRefresh()
    if (ok) {
      // re-read csrf (should be unchanged) and retry
      const csrf = readCsrfCookie()
      if (csrf) headers.set("x-csrf-token", csrf)
      res = await doFetch()
    }
  }

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* ignore */
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
  if (isNativeApp()) {
    return apiFetch<T>(input, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
        "x-transfer-encoding": "base64",
      },
      body: await fileToBase64(file),
    })
  }
  const bytes = await file.arrayBuffer()
  return apiFetch<T>(input, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
    },
    body: bytes,
  })
}

// Same detection as Capacitor core (androidBridge / webkit.messageHandlers),
// inlined to keep @capacitor/core out of the web bundle.
function isNativeApp(): boolean {
  const w = window as unknown as {
    androidBridge?: unknown
    webkit?: { messageHandlers?: { bridge?: unknown } }
  }
  return !!w.androidBridge || !!w.webkit?.messageHandlers?.bridge
}

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
