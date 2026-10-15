/**
 * Client crash telemetry (HTTP seam): validated, capped, rate-limited —
 * a hostile or buggy client must not fill the host disk or spam the log.
 */
import { describe, it, expect } from "vitest"
import { http } from "./helpers.js"

describe("client logs", () => {
  it("accepts a well-formed error report", async () => {
    const res = await http
      .post("/api/client-logs")
      .send({ source: "web", level: "error", message: "boom", meta: { route: "study" } })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("rejects oversized and malformed reports", async () => {
    const big = await http
      .post("/api/client-logs")
      .send({ source: "web", level: "error", message: "x".repeat(5000) })

    expect(big.status).toBe(422)

    const bad = await http.post("/api/client-logs").send({ level: "error" })

    expect(bad.status).toBe(422)
  })
})
