import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AnswerQueue } from "./answer-queue"
import type { AnswerSender } from "./answer-queue"

/**
 * Seam: per-question answer ordering (real fakes, no module mocking).
 * A slow first POST must not let a stale option win; failures retry.
 */
/** Controllable promise gate for ordering tests. */
interface DeferredGate {
  promise: Promise<boolean>
  resolve: (v: boolean) => void
}

function deferred(): DeferredGate {
  const holder = {
    resolve: (_v: boolean): void => undefined,
  }

  const promise = new Promise<boolean>((res) => {
    holder.resolve = res
  })

  // Test-only sequencing gate: the executor resolver intentionally replaces
  // the placeholder so tests can resolve sends out of order.
  return { promise, resolve: holder.resolve }
}

describe("AnswerQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("sends rapid taps on one question in tap order (slow first response loses nothing)", async () => {
    const seen: Array<string> = []
    const gates = [deferred(), deferred()]
    let calls = 0

    const send: AnswerSender = async (qid, opt) => {
      seen.push(`${qid}:${String(opt)}`)
      const gate = gates[calls]
      calls += 1

      return gate.promise
    }

    const q = new AnswerQueue()

    q.submit("q1", 0, send)
    q.submit("q1", 2, send)
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual(["q1:0"])

    // Resolve the SECOND response first — delivery must still be ordered.
    gates[1].resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    // First send still in flight; second waits for it.
    expect(seen).toEqual(["q1:0"])

    gates[0].resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual(["q1:0", "q1:2"])
    expect(q.pendingCount()).toBe(0)
    q.stop()
  })

  it("different questions send concurrently", async () => {
    const seen: Array<string> = []

    const send: AnswerSender = async (qid, opt) => {
      seen.push(`${qid}:${String(opt)}`)

      return true
    }

    const q = new AnswerQueue()

    q.submit("q1", 0, send)
    q.submit("q2", 1, send)
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toContain("q1:0")
    expect(seen).toContain("q2:1")
    expect(q.pendingCount()).toBe(0)
    q.stop()
  })

  it("failed sends stay pending and retry on the timer", async () => {
    let calls = 0

    const send: AnswerSender = async () => {
      calls += 1

      return calls >= 2
    }

    const q = new AnswerQueue(1000)

    q.submit("q1", 1, send)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    expect(q.pendingCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toBe(2)
    expect(q.pendingCount()).toBe(0)
    q.stop()
  })

  it("flush reports false while rows remain unsent, true when drained", async () => {
    const sendFail: AnswerSender = async () => false
    const q = new AnswerQueue(60000)

    q.submit("q1", 1, sendFail)
    const bad = await q.flush(sendFail)
    expect(bad).toBe(false)
    expect(q.pendingCount()).toBe(1)

    const sendOk: AnswerSender = async () => true
    const good = await q.flush(sendOk)
    expect(good).toBe(true)
    expect(q.pendingCount()).toBe(0)
    q.stop()
  })

  it("stop() silences retries", async () => {
    let calls = 0

    const send: AnswerSender = async () => {
      calls += 1

      return false
    }

    const q = new AnswerQueue(1000)

    q.submit("q1", 1, send)
    await vi.advanceTimersByTimeAsync(0)
    q.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toBe(1)
  })
})
