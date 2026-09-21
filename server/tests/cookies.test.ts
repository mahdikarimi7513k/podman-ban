/**
 * Seam: raw cookie-header parsing (socket.io handshake path).
 * A malformed percent-encoding must never throw — it once crashed the
 * whole Node process before any auth (unauthenticated DoS).
 */
import { describe, it, expect } from "vitest"
import { readCookieFromHeader } from "../src/lib/auth/cookies.js"

describe("readCookieFromHeader", () => {
  it("decodes valid percent-encoding", () => {
    expect(readCookieFromHeader("pb_access=abc%20def; other=1", "pb_access")).toBe("abc def")
  })

  it("returns the raw value instead of throwing on malformed encoding", () => {
    expect(readCookieFromHeader("pb_access=%", "pb_access")).toBe("%")
    expect(readCookieFromHeader("pb_access=%ZZ", "pb_access")).toBe("%ZZ")
    expect(readCookieFromHeader("a=1; pb_access=%E0%A4%A", "pb_access")).toBe("%E0%A4%A")
  })

  it("returns undefined for missing header or name", () => {
    expect(readCookieFromHeader(null, "pb_access")).toBeUndefined()
    expect(readCookieFromHeader("", "pb_access")).toBeUndefined()
    expect(readCookieFromHeader("other=1", "pb_access")).toBeUndefined()
  })

  it("keeps values containing '=' intact", () => {
    expect(readCookieFromHeader("pb_access=a=b=c", "pb_access")).toBe("a=b=c")
  })
})
