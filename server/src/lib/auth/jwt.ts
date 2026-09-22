import { SignJWT, jwtVerify, type JWTPayload } from "jose"

const enc = new TextEncoder()

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error("JWT_SECRET is not set")
  return enc.encode(s)
}

export const ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL_SEC ?? 900)

// 30 days: rotation already extends this for active users, but students
// use the app intermittently (weekly rhythm, holidays) — a 7-day window
// logged them out "out of nowhere" and felt like a bug. The theft
// posture is unchanged: 15-minute access tokens, rotation with reuse
// detection, and httpOnly cookies all stay as they are.
// Override per deployment with JWT_REFRESH_TTL_SEC (seconds).
export const REFRESH_TTL_SEC = Number(process.env.JWT_REFRESH_TTL_SEC ?? 2592000)

export interface AccessPayload extends JWTPayload {
  sub: string          // user id
  role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN"
  name: string
  field: "FANI_HERFEI" | "KARDANESH"
}

export interface RefreshPayload extends JWTPayload {
  sub: string
  jti: string          // token id (we store hash in DB)
  fam: string          // rotation family
}

export async function signAccessToken(
  payload: Omit<AccessPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .setIssuer("podman-ban")
    .setAudience("podman-ban-users")
    .sign(secret())
}

export async function verifyAccessToken(token: string): Promise<AccessPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "podman-ban",
      audience: "podman-ban-users",
    })
    return payload as AccessPayload
  } catch {
    return null
  }
}

export async function signRefreshToken(
  payload: Omit<RefreshPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SEC}s`)
    .setIssuer("podman-ban")
    .setAudience("podman-ban-refresh")
    .sign(secret())
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "podman-ban",
      audience: "podman-ban-refresh",
    })
    return payload as RefreshPayload
  } catch {
    return null
  }
}
