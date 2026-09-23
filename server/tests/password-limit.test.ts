/**
 * Seam: password-change throttling.
 *
 * A stolen session must not grant unlimited guesses at the current
 * password (5/5min per account): hammering with wrong passwords trips
 * 429 while a quiet user is unaffected.
 */
import { describe, it, expect } from "vitest"
import { login, ensureUser } from "./helpers.js"
import { PASSWORD } from "./fixtures.js"

describe("password change rate limit", () => {
  it("trips to 429 on repeated wrong-password attempts", async () => {
    await ensureUser("pwd_hammer", "STUDENT", "FANI_HERFEI")
    const authed = await login("pwd_hammer", PASSWORD)
    let tripped = false

    for (let i = 0; i < 7; i++) {
      const res = await authed.put("/api/user/password", {
        currentPassword: "Wrong-Pass-999",
        newPassword: "New-Pass-999",
      })

      if (res.status === 429) {
        tripped = true

        expect(Number.isInteger(res.body.retryAfterSec)).toBe(true)
        break
      }

      expect(res.status).toBe(422)
    }

    expect(tripped).toBe(true)
  })

  it("a quiet user still changes the password normally", async () => {
    await ensureUser("pwd_quiet", "STUDENT", "FANI_HERFEI")
    const authed = await login("pwd_quiet", PASSWORD)

    const res = await authed.put("/api/user/password", {
      currentPassword: PASSWORD,
      newPassword: "Quiet-New-123",
    })

    expect(res.status).toBe(200)

    // New password works from here on.
    await login("pwd_quiet", "Quiet-New-123")
  })
})
