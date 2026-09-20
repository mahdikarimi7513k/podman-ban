
import * as React from "react"
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useReducedMotion,
} from "framer-motion"
import {
  ArrowRight,
  ArrowLeft,
  SkipForward,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Flag,
  Clock,
  Eye,
  Check,
  X,
  BookOpen,
  Grid3x3,
} from "lucide-react"
import { useApp } from "@/lib/store"
import { apiFetch, ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { FaNum } from "@/components/fa-utils"
import { useToast } from "@/hooks/use-toast"

interface ExamQuestion {
  id: string
  text: string
  options: string[]
  imageBase64?: string | null
  order: number
}

interface SessionInfo {
  id: string
  moduleId: string
  moduleTitle: string
  bookTitle: string
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED"
  totalQuestions: number
  durationSec: number
  negativeMarking: boolean
  isPractice?: boolean
  startedAt: string
  finishedAt: string | null
  scorePercent: number
}

interface SessionResponse {
  session: SessionInfo
  questions: ExamQuestion[]
  answers: Record<string, { questionId: string; selectedOption: number | null; timeSpentMs: number }>
}

interface FinishedResult {
  sessionId: string
  totalQuestions: number
  correctCount: number
  wrongCount: number
  skippedCount: number
  scorePercent: number
  negativeMarking: boolean
}

interface ReviewQuestion extends ExamQuestion {
  correctOption: number
  explanation: string | null
}

interface ReviewData {
  session: {
    id: string
    moduleTitle: string
    bookTitle: string
    totalQuestions: number
    correctCount: number
    wrongCount: number
    skippedCount: number
    scorePercent: number
    negativeMarking: boolean
  }
  questions: ReviewQuestion[]
  answers: Record<string, { questionId: string; selectedOption: number | null; isCorrect: boolean | null }>
}

const LETTERS = ["الف", "ب", "ج", "د"]

// One in-flight GET /api/exam/:id per session, shared across StrictMode's
// double effect invocation (dev) and any remount races.
const sessionInflight = new Map<string, Promise<SessionResponse>>()
function fetchSessionOnce(sessionId: string): Promise<SessionResponse> {
  let p = sessionInflight.get(sessionId)
  if (!p) {
    p = apiFetch<SessionResponse>(`/api/exam/${sessionId}`).finally(() => {
      sessionInflight.delete(sessionId)
    })
    sessionInflight.set(sessionId, p)
  }
  return p
}

export function ExamView() {
  const examSessionId = useApp((s) => s.examSessionId)
  const exitExam = useApp((s) => s.exitExam)
  const { toast } = useToast()
  const reduced = useReducedMotion()

  const [data, setData] = React.useState<SessionResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [index, setIndex] = React.useState(0)
  const [direction, setDirection] = React.useState(1)
  const [answers, setAnswers] = React.useState<
    Record<string, number | null>
  >({})
  const [result, setResult] = React.useState<FinishedResult | null>(null)
  const [finishing, setFinishing] = React.useState(false)
  const [reviewMode, setReviewMode] = React.useState(false)
  const [reviewData, setReviewData] = React.useState<ReviewData | null>(null)
  const [loadingReview, setLoadingReview] = React.useState(false)
  const [flagged, setFlagged] = React.useState<Set<string>>(new Set())
  // practice mode: revealed answers per question
  const [revealed, setRevealed] = React.useState<
    Record<string, { correctOption: number; explanation: string | null }>
  >({})
  const [showNavGrid, setShowNavGrid] = React.useState(false)

  // ---- load session ----
  // StrictMode mounts effects twice in dev — share one in-flight request so
  // the session (the payload that gates first paint) is fetched exactly once.
  React.useEffect(() => {
    if (!examSessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchSessionOnce(examSessionId)
        if (cancelled) return
        setData(res)
        const initial: Record<string, number | null> = {}
        for (const q of res.questions) {
          const a = res.answers[q.id]
          initial[q.id] = a ? a.selectedOption : null
        }
        setAnswers(initial)
        if (res.session.status === "FINISHED") {
          // GET /exam/:session carries no per-question verdicts, so a
          // reopened report would show 0/0 and every question "unanswered".
          // The /review endpoint has the real counts — load it up front so
          // the result screen is correct and review opens instantly.
          try {
            const review = await apiFetch<ReviewData>(`/api/exam/${examSessionId}/review`)

            if (cancelled) return
            setReviewData(review)
            setResult({
              sessionId: review.session.id,
              totalQuestions: review.session.totalQuestions,
              correctCount: review.session.correctCount,
              wrongCount: review.session.wrongCount,
              skippedCount: review.session.skippedCount,
              scorePercent: review.session.scorePercent,
              negativeMarking: review.session.negativeMarking,
            })
          } catch {
            if (cancelled) return
            setResult({
              sessionId: res.session.id,
              totalQuestions: res.session.totalQuestions,
              correctCount: 0,
              wrongCount: 0,
              skippedCount: res.session.totalQuestions,
              scorePercent: res.session.scorePercent,
              negativeMarking: res.session.negativeMarking,
            })
          }
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "بارگذاری آزمون ناموفق بود")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [examSessionId])

  // ---- answer persistence with retry ----
  // A dropped request (tunnel, offline blip) must not silently lose an
  // answer — finishExam scores from saved rows only. Unsent answers wait in
  // a small pending map: retried in the background and flushed on finish.
  const pendingRef = React.useRef(new Map<string, number | null>())
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const postAnswer = React.useCallback(
    async (questionId: string, selectedOption: number | null): Promise<boolean> => {
      if (!examSessionId) return false

      try {
        await apiFetch(`/api/exam/${examSessionId}/answer`, {
          method: "POST",
          body: JSON.stringify({ questionId, selectedOption }),
        })

        return true
      } catch {
        return false
      }
    },
    [examSessionId],
  )

  const flushPending = React.useCallback(async (): Promise<boolean> => {
    let allOk = true

    for (const [qid, opt] of Array.from(pendingRef.current.entries())) {
      const ok = await postAnswer(qid, opt)

      if (ok) pendingRef.current.delete(qid)
      else allOk = false
    }

    return allOk
  }, [postAnswer])

  const scheduleRetry = React.useCallback(() => {
    if (retryTimerRef.current !== null) return
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      void flushPending().then((ok) => {
        if (!ok) scheduleRetry()
      })
    }, 3000)
  }, [flushPending])

  const recordAnswer = React.useCallback(
    async (questionId: string, selectedOption: number | null) => {
      if (!examSessionId) return
      pendingRef.current.set(questionId, selectedOption)
      const ok = await postAnswer(questionId, selectedOption)

      if (ok) pendingRef.current.delete(questionId)
      else scheduleRetry()
    },
    [examSessionId, postAnswer, scheduleRetry],
  )

  // Drop the retry chain on unmount — finish() flushes synchronously instead.
  React.useEffect(
    () => () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
    },
    [],
  )

  const select = async (questionId: string, option: number) => {
    setAnswers((a) => ({ ...a, [questionId]: option }))
    void recordAnswer(questionId, option)
    // In practice mode, fetch the correct answer immediately for feedback
    if (data?.session.isPractice && !revealed[questionId] && examSessionId) {
      try {
        const res = await apiFetch<{ correctOption: number; explanation: string | null }>(
          `/api/exam/${examSessionId}/check`,
          { method: "POST", body: JSON.stringify({ questionId }) },
        )
        setRevealed((r) => ({ ...r, [questionId]: res }))
      } catch {
        /* silent */
      }
    }
  }

  const skip = (questionId: string) => {
    setAnswers((a) => ({ ...a, [questionId]: null }))
    void recordAnswer(questionId, null)
    goNext()
  }

  const goNext = () => {
    setDirection(1)
    setIndex((i) => Math.min(i + 1, (data?.questions.length ?? 1) - 1))
  }
  const goPrev = () => {
    setDirection(-1)
    setIndex((i) => Math.max(i - 1, 0))
  }

  // When the question changes, bring the viewport back to the top so a
  // long question doesn't leave the next one scrolled out of view.
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
  }, [index, reduced])

  const toggleFlag = (questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const finish = React.useCallback(async () => {
    if (!examSessionId) return
    setFinishing(true)

    try {
      // Flush answers the background retry hasn't landed yet — finishing
      // with unsaved rows would silently undercount the score.
      const flushed = await flushPending()

      const res = await apiFetch<{ result: FinishedResult }>(
        `/api/exam/${examSessionId}/finish`,
        { method: "POST", body: JSON.stringify({}) },
      )

      setResult(res.result)

      if (!flushed) {
        toast({
          title: "برخی پاسخ‌ها ذخیره نشد",
          description: "نمره ممکن است ناقص باشد — اتصال اینترنت را بررسی کنید.",
        })
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ثبت آزمون ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setFinishing(false)
    }
  }, [examSessionId, toast, flushPending])

  const loadReview = React.useCallback(async () => {
    if (!examSessionId) return
    setLoadingReview(true)
    try {
      const res = await apiFetch<ReviewData>(
        `/api/exam/${examSessionId}/review`,
      )
      setReviewData(res)
      setReviewMode(true)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "بارگذاری بازبینی ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setLoadingReview(false)
    }
  }, [examSessionId, toast])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <p className="text-sm text-destructive">{error ?? "خطای ناشناخته"}</p>
        <Button variant="outline" onClick={exitExam} className="cursor-pointer">
          بازگشت به خانه
        </Button>
      </div>
    )
  }
  if (result && reviewMode && reviewData) {
    return (
      <ExamReview
        data={reviewData}
        flagged={flagged}
        onExit={() => {
          setReviewMode(false)
          exitExam()
        }}
        onBack={() => setReviewMode(false)}
      />
    )
  }
  if (result) {
    return (
      <ExamResult
        result={result}
        onExit={exitExam}
        onReview={loadReview}
        loadingReview={loadingReview}
      />
    )
  }

  const question = data.questions[index]
  const total = data.questions.length
  const answeredCount = Object.values(answers).filter(
    (v) => v !== null && v !== undefined,
  ).length

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {!data.session.isPractice && (
        <ExamTimer
          startedAt={data.session.startedAt}
          durationSec={data.session.durationSec}
          onExpire={finish}
          reduced={Boolean(reduced)}
        />
      )}
      {data.session.isPractice && (
        <div className="sticky top-0 z-20 bg-background border-b border-border">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-medium">
              <BookOpen className="size-3.5" strokeWidth={2} />
              حالت تمرین
            </span>
            <span className="text-[11px] text-muted-foreground">
              بدون محدودیت زمان — پاسخ صحیح بعد از انتخاب نمایش داده می‌شود
            </span>
          </div>
        </div>
      )}

      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {data.session.bookTitle}
            </p>
            <h2 className="text-sm font-semibold truncate">
              {data.session.moduleTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span className="tabular-nums">
              سوال <FaNum>{index + 1}</FaNum> از <FaNum>{total}</FaNum>
            </span>
            {flagged.size > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                <Flag className="size-3" fill="currentColor" />
                <FaNum>{flagged.size}</FaNum>
              </span>
            )}
            <button
              type="button"
              onClick={() => toggleFlag(question.id)}
              aria-label={flagged.has(question.id) ? "حذف نشان" : "نشان‌گذاری سوال"}
              aria-pressed={flagged.has(question.id)}
              className={`inline-flex size-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                flagged.has(question.id)
                  ? "text-warning"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Flag
                className="size-4"
                strokeWidth={2}
                fill={flagged.has(question.id) ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {/* Enter-only transition: the next question mounts immediately on
            navigation (no exit animation, no empty gap), so the page height
            never collapses and scroll stays stable while moving fast. */}
        <motion.div
          key={question.id}
          initial={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, x: direction > 0 ? 12 : -12 }
          }
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.12,
            ease: [0.2, 0, 0, 1],
          }}
        >
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold tabular-nums">
                  <FaNum>{index + 1}</FaNum>
                </span>
                <p className="text-[15px] leading-8 font-medium whitespace-pre-wrap">
                  {question.text}
                </p>
              </div>

              {question.imageBase64 ? (
                <div className="mt-4 flex justify-center">
                  {/* Constrained: max-w full, max-h so it never blows the layout,
                      aspect-ratio preserved via object-contain. */}
                  <img
                    src={question.imageBase64}
                    alt="تصویر سوال"
                    loading="lazy"
                    className="max-w-full max-h-[40vh] w-auto h-auto rounded-lg border border-border object-contain"
                  />
                </div>
              ) : null}

              <ul className="mt-5 space-y-2.5" role="radiogroup" aria-label="گزینه‌ها">
                {question.options.map((opt, i) => {
                  const selected = answers[question.id] === i
                  const isRevealed = !!revealed[question.id]
                  const isCorrect = isRevealed && revealed[question.id].correctOption === i
                  const isWrong = isRevealed && selected && !isCorrect
                  const disabled = isRevealed
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => !disabled && select(question.id, i)}
                        className={`w-full min-h-[52px] flex items-center gap-3 rounded-lg border px-3.5 py-3 text-right transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                          disabled ? "cursor-default" : "cursor-pointer"
                        } ${
                          isCorrect
                            ? "border-success bg-success/5"
                            : isWrong
                              ? "border-destructive bg-destructive/5"
                              : selected
                                ? "border-foreground bg-foreground/[0.06]"
                                : "border-border bg-background hover:bg-accent/60"
                        }`}
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                            isCorrect
                              ? "border-success bg-success text-white"
                              : isWrong
                                ? "border-destructive bg-destructive text-white"
                                : selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border text-muted-foreground"
                          }`}
                        >
                          {isCorrect ? (
                            <Check className="size-3.5" strokeWidth={3} />
                          ) : isWrong ? (
                            <X className="size-3.5" strokeWidth={3} />
                          ) : (
                            LETTERS[i]
                          )}
                        </span>
                        <span className="text-sm leading-relaxed flex-1">{opt}</span>
                        {isCorrect && (
                          <span className="text-[10px] font-medium text-success shrink-0">صحیح</span>
                        )}
                        {isWrong && (
                          <span className="text-[10px] font-medium text-destructive shrink-0">پاسخ شما</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Practice mode: show explanation after reveal */}
              {revealed[question.id]?.explanation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-lg bg-secondary/50 border border-border p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">توضیح</p>
                    <p className="text-xs leading-relaxed text-foreground/80">
                      {revealed[question.id].explanation}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            <FaNum>{answeredCount}</FaNum> پاسخ داده‌شده
            {" — "}
            <FaNum>{total - answeredCount}</FaNum> بدون پاسخ
          </p>
          <button
            type="button"
            onClick={() => setShowNavGrid((v) => !v)}
            aria-label="نمایش گرید سوالات"
            aria-pressed={showNavGrid}
            className={`inline-flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
              showNavGrid
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Grid3x3 className="size-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Question navigation grid */}
        <AnimatePresence>
          {showNavGrid && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <div className="grid grid-cols-6 gap-1.5">
                  {data.questions.map((q, i) => {
                    const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null
                    const isCurrent = i === index
                    const isFlagged = flagged.has(q.id)
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          setDirection(i > index ? 1 : -1)
                          setIndex(i)
                          setShowNavGrid(false)
                        }}
                        aria-label={`سوال ${i + 1}`}
                        className={`relative aspect-square rounded-md text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                          isCurrent
                            ? "bg-foreground text-background ring-2 ring-foreground ring-offset-2 ring-offset-card"
                            : isAnswered
                              ? "bg-foreground/15 text-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <FaNum>{i + 1}</FaNum>
                        {isFlagged && (
                          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-warning" />
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-foreground/15" />
                    پاسخ‌داده‌شده
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-muted" />
                    بدون پاسخ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-warning" />
                    نشان‌شده
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur pb-safe">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goPrev}
            disabled={index === 0}
            aria-label="سوال قبلی"
            className="cursor-pointer"
          >
            <ArrowRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => skip(question.id)}
            className="cursor-pointer flex-1 text-muted-foreground"
          >
            <SkipForward className="size-4" />
            رد شدن
          </Button>
          {index < total - 1 ? (
            <Button onClick={goNext} className="cursor-pointer flex-1">
              سوال بعدی
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={finish}
              disabled={finishing}
              className="cursor-pointer flex-1"
            >
              {finishing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Flag className="size-4" strokeWidth={2.25} />
              )}
              اتمام آزمون
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

function ExamTimer({
  startedAt,
  durationSec,
  onExpire,
  reduced,
}: {
  startedAt: string
  durationSec: number
  onExpire: () => void
  reduced: boolean
}) {
  const startMs = new Date(startedAt).getTime()
  const endMs = startMs + durationSec * 1000

  // scaleX instead of width: the bar depletes on the compositor (GPU) without
  // re-layout every frame. originX = right edge, the inline start in RTL.
  const progress = useMotionValue(1)
  const [remainingSec, setRemainingSec] = React.useState(
    Math.max(0, Math.round((endMs - Date.now()) / 1000)),
  )
  const [danger, setDanger] = React.useState(false)
  const expiredRef = React.useRef(false)

  React.useEffect(() => {
    const update = () => {
      const remMs = endMs - Date.now()
      const rem = Math.max(0, remMs / 1000)
      progress.set(rem / durationSec)
      setRemainingSec(Math.ceil(rem))
      setDanger(rem <= 30 && rem > 0)
      if (rem <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpire()
        return true
      }
      return false
    }
    if (update()) return
    // A wall-clock ticks once per second — a rAF loop re-rendered 60×/s for
    // the same information. Drift-free because it recomputes from Date.now().
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endMs, durationSec, onExpire])

  const mins = Math.floor(remainingSec / 60)
  const secs = remainingSec % 60

  return (
    <div className="sticky top-0 z-20 bg-background border-b border-border">
      <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-3">
        <Clock
          className={`size-4 ${danger ? "text-destructive" : "text-muted-foreground"}`}
          strokeWidth={2}
        />
        <span
          className={`tabular-nums text-sm font-semibold ${danger ? "text-destructive" : ""}`}
        >
          <FaNum>{String(mins).padStart(2, "0")}</FaNum>:
          <FaNum>{String(secs).padStart(2, "0")}</FaNum>
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={`h-full w-full rounded-full ${danger ? "bg-destructive" : "bg-foreground"}`}
            style={reduced ? undefined : { scaleX: progress, originX: 1 }}
          />
        </div>
      </div>
    </div>
  )
}

function ExamResult({
  result,
  onExit,
  onReview,
  loadingReview,
}: {
  result: FinishedResult
  onExit: () => void
  onReview: () => void
  loadingReview: boolean
}) {
  const pct = result.scorePercent
  const verdict =
    pct >= 50 ? "success" : pct >= 25 ? "warning" : "error"
  const verdictText =
    verdict === "success"
      ? "آفرین! نتیجه‌ی خوبی بود."
      : verdict === "warning"
        ? "قابل‌قبول، اما جای بهبود هست."
        : "تلاش بیشتری لازم است."
  const verdictColor =
    verdict === "success"
      ? "text-success"
      : verdict === "warning"
        ? "text-warning"
        : "text-destructive"

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-8 flex flex-col items-center justify-center text-center">
        <div className="flex flex-col items-center">
          <div className="relative size-32">
            <svg className="size-32 -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="8"
              />
              <motion.circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={
                  verdict === "success"
                    ? "var(--success)"
                    : verdict === "warning"
                      ? "var(--warning)"
                      : "var(--destructive)"
                }
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - pct / 100) }}
                transition={{ duration: 1.1, ease: [0.2, 0, 0, 1] }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold tabular-nums ${verdictColor}`}>
                <FaNum>{pct}</FaNum>
              </span>
              <span className="text-xs text-muted-foreground">درصد</span>
            </div>
          </div>
          <p className={`mt-4 text-sm font-medium ${verdictColor}`}>{verdictText}</p>
        </div>

        <div className="mt-8 w-full grid grid-cols-3 gap-2">
          <ResultStat
            icon={<CheckCircle2 className="size-4" />}
            label="صحیح"
            value={result.correctCount}
            tone="success"
          />
          <ResultStat
            icon={<XCircle className="size-4" />}
            label="غلط"
            value={result.wrongCount}
            tone="error"
          />
          <ResultStat
            icon={<MinusCircle className="size-4" />}
            label="نزده"
            value={result.skippedCount}
            tone="muted"
          />
        </div>

        {result.negativeMarking && (
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            نمره با درنظرگرفتن نمره‌ی منفی (صحیح +۳، غلط −۱) محاسبه شده است.
          </p>
        )}

        <Button
          onClick={onReview}
          disabled={loadingReview}
          variant="outline"
          className="mt-8 w-full h-11 cursor-pointer"
        >
          {loadingReview ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Eye className="size-4" strokeWidth={2.25} />
          )}
          بازبینی پاسخ‌ها
        </Button>
        <Button onClick={onExit} variant="ghost" className="mt-2 w-full h-11 cursor-pointer text-muted-foreground">
          بازگشت به خانه
        </Button>
      </main>
    </div>
  )
}

// ---------------- Exam Review ----------------

function ExamReview({
  data,
  flagged,
  onExit,
  onBack,
}: {
  data: ReviewData
  flagged: Set<string>
  onExit: () => void
  onBack: () => void
}) {
  const total = data.questions.length
  const visibleQuestions = data.questions

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur pt-safe">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] cursor-pointer"
            aria-label="بازگشت به نتیجه"
          >
            <ArrowRight className="size-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {data.session.bookTitle}
            </p>
            <h2 className="text-sm font-semibold truncate">
              {data.session.moduleTitle} — پاسخنامه تشریحی
            </h2>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            <FaNum>{total}</FaNum> سوال
          </span>
        </div>
      </header>

      {/* scrollable list of all questions */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 scroll-mono overflow-y-auto pb-24">
        <div className="space-y-4">
          {visibleQuestions.map((question, qi) => {
            const userAnswer = data.answers[question.id]
            const selected = userAnswer?.selectedOption ?? null
            const isFlagged = flagged.has(question.id)
            return (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(qi * 0.04, 0.32), ease: [0.2, 0, 0, 1] }}
              >
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold tabular-nums mt-0.5">
                      <FaNum>{qi + 1}</FaNum>
                    </span>
                    <p className="text-sm leading-7 font-medium whitespace-pre-wrap flex-1">
                      {question.text}
                    </p>
                    {isFlagged && (
                      <Flag className="size-4 shrink-0 text-warning mt-1" fill="currentColor" strokeWidth={2} />
                    )}
                  </div>

                  {question.imageBase64 ? (
                    <div className="mt-3 flex justify-center">
                      <img
                        src={question.imageBase64}
                        alt="تصویر سوال"
                        className="max-w-full max-h-[35vh] w-auto h-auto rounded-lg border border-border object-contain"
                      />
                    </div>
                  ) : null}

                  {/* options — show correct answer highlighted */}
                  <ul className="mt-3 space-y-1.5">
                    {question.options.map((opt, i) => {
                      const isCorrect = i === question.correctOption
                      const isSelected = selected === i
                      const isWrong = isSelected && !isCorrect
                      return (
                        <li key={i}>
                          <div
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                              isCorrect
                                ? "border-success bg-success/5"
                                : isWrong
                                  ? "border-destructive bg-destructive/5"
                                  : "border-border bg-background"
                            }`}
                          >
                            <span
                              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                                isCorrect
                                  ? "border-success bg-success text-white"
                                  : isWrong
                                    ? "border-destructive bg-destructive text-white"
                                    : "border-border text-muted-foreground"
                              }`}
                            >
                              {isCorrect ? (
                                <Check className="size-3" strokeWidth={3} />
                              ) : isWrong ? (
                                <X className="size-3" strokeWidth={3} />
                              ) : (
                                LETTERS[i]
                              )}
                            </span>
                            <span className="text-sm leading-relaxed flex-1">{opt}</span>
                            {isCorrect && (
                              <span className="text-[10px] font-medium text-success shrink-0">صحیح</span>
                            )}
                            {isWrong && (
                              <span className="text-[10px] font-medium text-destructive shrink-0">پاسخ شما</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  {/* explanation */}
                  {question.explanation && (
                    <div className="mt-3 rounded-lg bg-secondary/50 border border-border p-2.5">
                      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">توضیح</p>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {question.explanation}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* exit button at bottom */}
        <div className="mt-6 sticky bottom-0 bg-background/85 backdrop-blur py-3 -mx-4 px-4 border-t border-border">
          <Button onClick={onExit} className="w-full h-11 cursor-pointer">
            <Check className="size-4" strokeWidth={2.5} />
            بازگشت به خانه
          </Button>
        </div>
      </main>
    </div>
  )
}

function ResultStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: "success" | "error" | "muted"
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "error"
        ? "text-destructive"
        : "text-muted-foreground"
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col items-center gap-1">
      <span className={toneClass}>{icon}</span>
      <span className="text-lg font-bold tabular-nums">
        <FaNum>{value}</FaNum>
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
