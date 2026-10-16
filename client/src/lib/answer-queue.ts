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

  constructor(private readonly retryMs = 3000) {}

  /** Latest value wins in the map; delivery for this question is chained. */
  submit(questionId: string, selectedOption: number | null, send: AnswerSender): void {
    this.pending.set(questionId, selectedOption)
    this.sender = send
    void this.enqueue(questionId, selectedOption, send)
  }

  /** Send every pending answer through its question chain. */
  async flush(send: AnswerSender): Promise<boolean> {
    this.sender = send

    const jobs = Array.from(this.pending.entries()).map(([qid, opt]) =>
      this.enqueue(qid, opt, send),
    )

    const results = await Promise.all(jobs)

    if (this.pending.size === 0) this.clearTimer()

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
