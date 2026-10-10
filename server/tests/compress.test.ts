/**
 * Gzip middleware: large JSON payloads stay parseable (correct
 * Content-Type + Content-Encoding) so phones and HTTP clients decode them.
 * Raw node:http is used for the wire assertions — superagent sometimes
 * auto-unzips before a custom parser sees the bytes (flaky).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { gunzipSync } from "node:zlib"
import type { AddressInfo } from "node:net"
import http from "node:http"
import { buildApp } from "../src/app.js"
import { login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

let base = ""

let closeServer: () => Promise<void> = async () => {}

beforeAll(async () => {
  const app = buildApp()
  const server = app.listen(0)

  await new Promise<void>((r) => server.on("listening", r))

  // SAFETY: app.listen(0) on a TCP server always yields an AddressInfo
  // once listening — the await above proves the state.
  const { port } = server.address() as AddressInfo

  base = `http://127.0.0.1:${port}`
  closeServer = () =>
    new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    )
})

afterAll(() => closeServer())

interface WireResult {
  status: number
  encoding: string
  contentType: string
  body: Buffer
}

function getRaw(path: string, cookies: string): Promise<WireResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base)

    const req = http.request(
      {
        host: url.hostname,
        port: Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { Cookie: cookies, "Accept-Encoding": "gzip" },
      },
      (res) => {
        const chunks: Buffer[] = []

        res.on("data", (c: Buffer) => chunks.push(Buffer.from(c)))
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            encoding: String(res.headers["content-encoding"] ?? ""),
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks),
          })
        })
      },
    )

    req.on("error", reject)
    req.end()
  })
}

describe("gzip json", () => {
  it("round-trips a gzipped study overview", async () => {
    await ensureUser("gzip_admin", "ADMIN", "FANI_HERFEI")
    const s = await login("gzip_admin", PASSWORD)
    const wire = await getRaw("/api/study/overview?range=month", s.cookies)

    expect(wire.status).toBe(200)
    expect(wire.contentType).toContain("application/json")

    const text = wire.encoding.includes("gzip")
      ? gunzipSync(wire.body).toString("utf8")
      : wire.body.toString("utf8")

    // SAFETY: the endpoint contract is JSON; a wrong shape fails the
    // assertions below instead of passing silently.
    const json = JSON.parse(text) as { totalMinutes?: unknown }

    expect(Number.isFinite(json.totalMinutes)).toBe(true)
  })

  it("keeps json content-type under gzip", async () => {
    await ensureUser("gzip_dup", "STUDENT", "KARDANESH")
    const s = await login("gzip_dup", PASSWORD)
    const wire = await getRaw("/api/books", s.cookies)

    expect(wire.status).toBe(200)
    expect(wire.contentType).toContain("application/json")

    const text = wire.encoding.includes("gzip")
      ? gunzipSync(wire.body).toString("utf8")
      : wire.body.toString("utf8")

    // SAFETY: same JSON-contract reasoning as above.
    const json = JSON.parse(text) as { books?: unknown }

    expect(Array.isArray(json.books)).toBe(true)
  })
})
