import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { apiUpload } from "./api-client"

/**
 * Seam: upload transport. Web sends raw bytes; the native app must send a
 * base64 string (the Capacitor bridge cannot transport ArrayBuffer bodies
 * losslessly). The server decodes with Buffer.from(body, "base64") — the
 * test asserts exactly that round-trip.
 */
const fetchMock = vi.fn()

function lastCall(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

function mockAndroidBridge(on: boolean): void {
  const w = window as unknown as Record<string, unknown>
  if (on) w.androidBridge = {}
  else delete w.androidBridge
}

describe("apiUpload", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    mockAndroidBridge(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockAndroidBridge(false)
  })

  it("web: sends raw ArrayBuffer bytes with no transfer header", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01])
    const file = new File([bytes], "photo.jpg", { type: "image/jpeg" })
    await apiUpload("/api/x", file)
    const { url, init, headers } = lastCall()
    expect(url).toBe("/api/x")
    expect(headers.get("x-transfer-encoding")).toBeNull()
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes)
  })

  it("native app: sends base64 + x-transfer-encoding that decodes to the same bytes", async () => {
    mockAndroidBridge(true)
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0xfe])
    const file = new File([bytes], "photo.jpg", { type: "image/jpeg" })
    await apiUpload("/api/x", file)
    const { headers } = lastCall()
    expect(headers.get("x-transfer-encoding")).toBe("base64")
    const body = fetchMock.mock.calls[0][1].body as string
    expect(typeof body).toBe("string")
    expect(Buffer.from(body, "base64")).toEqual(Buffer.from(bytes))
  })
})
