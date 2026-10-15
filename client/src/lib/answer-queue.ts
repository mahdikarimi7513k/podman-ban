/**
 * Per-question answer queue — fixes out-of-order delivery.
 *
 * Two rapid taps on the same question used to fire two parallel POSTs; on a
 * slow mobile network the older one could land last, so the database kept a
 * stale option while the UI showed the new one (and the final score
 * disagreed with the screen). Submissions for one question are chained:
 * each send starts only after the previous one for the same question
 * settles, so arrival order always matches tap order. Different questions
 * still send concurrently.
 *
 * Failures stay pending and are retried on a timer + flushed explicitly
 * (finish). The queue never throws — senders report success as boolean.
 */

export type AnswerSender = (
  questionId: string,
  selectedOption: number | null,
) => Promise<boolean>

export class AnswerQueue {
  private pending = new Map<string, number | null>()
  private chains = new Map<string, Promise<void>>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private sender: AnswerSender | null = null

  constructor(
    private readonly retryMs = 3000,
    private readonly storageKey?: string,
  ) {
    this.restore()
  }

  /** Latest value wins in the map; delivery for this question is chained. */
  submit(questionId: string, selectedOption: number | null, send: AnswerSender): void {
    this.pending.set(questionId, selectedOption)
    this.sender = send
    this.persist()
    void this.enqueue(questionId, selectedOption, send)
  }

  /** Attach the sender without submitting (rehydrate after a remount). */
  attach(send: AnswerSender): void {
    this.sender = send
  }

  /** Send every pending answer through its question chain. */
  async flush(send: AnswerSender): Promise<boolean> {
    this.sender = send

    const jobs = Array.from(this.pending.entries()).map(([qid, opt]) =>
      this.enqueue(qid, opt, send),
    )

    const results = await Promise.all(jobs)

    if (this.pending.size === 0) this.clearTimer()

    this.persist()

    return results.every(Boolean)
  }

  /** Drop the retry timer (unmount). In-flight sends still settle. */
  stop(): void {
    this.sender = null
    this.clearTimer()
  }

  /** For tests only — how many answers are still unsent. */
  pendingCount(): number {
    return this.pending.size
  }

  private storageKeyFor(): string | null {
    return this.storageKey ? `pb_answers:${this.storageKey}` : null
  }

  private storage(): Storage | null {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null

      return window.localStorage
    } catch {
      return null
    }
  }

  /** Durability: a killed app must not lose tapped-but-unsent answers. */
  private persist(): void {
    const key = this.storageKeyFor()
    const store = key ? this.storage() : null

    if (!key || !store) return

    try {
      if (this.pending.size === 0) store.removeItem(key)
      else store.setItem(key, JSON.stringify(Array.from(this.pending.entries())))
    } catch {
      /* quota/private mode — memory queue still works this session */
    }
  }

  private restore(): void {
    const key = this.storageKeyFor()
    const store = key ? this.storage() : null

    if (!key || !store) return

    let raw: unknown

    try {
      const text = store.getItem(key)

      if (!text) return
      raw = JSON.parse(text)
    } catch {
      return
    }

    // SAFETY: shape-checked field by field below; only [non-empty string,
    // null-or-integer-option] pairs enter the live map.
    if (!Array.isArray(raw)) return

    for (const pair of raw) {
      if (!Array.isArray(pair) || pair.length !== 2) continue
      const id = String(pair[0] ?? "")

      if (!id) continue
      const opt: unknown = pair[1]

      if (opt !== null && !Number.isInteger(opt)) continue

      // SAFETY: null-or-finite-integer proven above; the map holds exactly that.
      this.pending.set(id, opt as number | null)
    }
  }

  private enqueue(questionId: string, selectedOption: number | null, send: AnswerSender): Promise<boolean> {
    const prev = this.chains.get(questionId) ?? Promise.resolve()

    const attempt = async (): Promise<boolean> => {
      let ok = false

      try {
        ok = await send(questionId, selectedOption)
      } catch {
        ok = false
      }

      if (ok) {
        if (this.pending.get(questionId) === selectedOption) this.pending.delete(questionId)
      } else {
        this.scheduleRetry()
      }

      this.persist()

      return ok
    }
    // Both branches: a failed link must never break the chain for later taps.

    const cur = prev.then(attempt, attempt)

    this.chains.set(questionId, cur.then(
      () => undefined,
      () => undefined,
    ))

    return cur
  }

  private scheduleRetry(): void {
    if (this.timer !== null || this.sender === null) return

    this.timer = setTimeout(() => {
      this.timer = null
      const send = this.sender

      if (send) void this.flush(send)
    }, this.retryMs)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
