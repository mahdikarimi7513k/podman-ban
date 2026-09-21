import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { apiFetch, apiUpload, ApiError, DEFAULT_TIMEOUT_MS } from "./api-client"

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

/**
 * Seam: network timeout. A stalled connection must fail fast (Persian
 * ApiError) instead of hanging boot/views forever; caller signals win.
 */
describe("apiFetch timeout", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("aborts a hung request after the default timeout", async () => {
    const controller = new AbortController()

    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => controller.signal)

    const abortErr = () => new DOMException("AbortError", "AbortError")
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          if (init?.signal?.aborted) {
            reject(abortErr())

            return
          }

          init?.signal?.addEventListener("abort", () => {
            reject(abortErr())
          })
        }),
    )

    const pending = apiFetch("/api/config")

    const check = expect(pending).rejects.toMatchObject({
      message: expect.stringContaining("اینترنت"),
    })

    controller.abort()
    await check

    expect(timeoutSpy).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS)
    timeoutSpy.mockRestore()
  })

  it("respects a caller-provided signal without imposing its own", async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException("AbortError", "AbortError"))

            return
          }

          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("AbortError", "AbortError"))
          })
        }),
    )
    const controller = new AbortController()

    const pending = apiFetch("/api/config", { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(ApiError)
  })

  it("fast responses never touch the timeout", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    await expect(apiFetch("/api/config")).resolves.toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
