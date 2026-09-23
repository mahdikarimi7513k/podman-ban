/**
 * Seam: malformed request bodies.
 *
 * Invalid JSON used to fall through to the generic handler: 500 plus log
 * noise, and a distinguishable failure mode for probers. It must answer
 * 400 JSON (413 when over the 3mb limit) while valid bodies flow through.
 */
import { describe, it, expect } from "vitest"
import { http } from "./helpers.js"

describe("malformed JSON bodies", () => {
  it("answers 400 JSON instead of 500", async () => {
    const res = await http
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"username": "broken",')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe("قالب درخواست نامعتبر است")
  })

  it("answers 413 for bodies over the json limit", async () => {
    const res = await http
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(`{"username": "${"x".repeat(4 * 1024 * 1024)}"}`)

    expect(res.status).toBe(413)
    expect(res.body.error).toBe("بدنه‌ی درخواست بیش از حد بزرگ است")
  })

  it("still parses valid JSON normally", async () => {
    const res = await http
      .post("/api/auth/login")
      .send({ username: "nouser", password: "Wrong-1234" })

    expect(res.status).toBe(401)
  })
})
