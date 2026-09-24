
import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BookOpen, ChevronLeft, Play, FileQuestion, Loader2, RotateCcw, Clock, Check } from "lucide-react"
import { useApp } from "@/lib/store"
import { apiFetch, ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FaNum } from "@/components/fa-utils"
import { preloadExamView } from "@/App"
import { parseExamPrefs, resolveExamDurationMin, resolveDailyGoal, shouldHideRepeats } from "@/lib/exam-prefs"
import type { BookWithModules } from "@/lib/exam/question-bank"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn, ICON_STROKE, ICON_STROKE_ACTION, ICON_STROKE_BADGE, ICON_STROKE_DISPLAY } from "@/lib/utils";

interface StartResult {
  session: {
    sessionId: string
    moduleId: string
    moduleTitle: string
    bookTitle: string
    totalQuestions: number
    durationSec: number
    negativeMarking: boolean
  }
}

interface InProgressSession {
  id: string
  moduleId: string
  moduleTitle: string
  bookTitle: string
  startedAt: string
  durationSec: number
  totalQuestions: number
}

export function HomeView() {
  const user = useApp((s) => s.user)
  const config = useApp((s) => s.config)
  const enterExam = useApp((s) => s.enterExam)
  const setView = useApp((s) => s.setView)
  const { toast } = useToast()
  const [books, setBooks] = React.useState<BookWithModules[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [startingId, setStartingId] = React.useState<string | null>(null)
  const [inProgress, setInProgress] = React.useState<InProgressSession | null>(null)
  const [durationPicker, setDurationPicker] = React.useState<{
    moduleId: string
    moduleTitle: string
  } | null>(null)
  const [dailyAnswered, setDailyAnswered] = React.useState<number | null>(null)

  // Applied settings (were hardcoded): user prefs → admin default → fallback.
  const prefs = React.useMemo(() => parseExamPrefs(user?.prefs), [user?.prefs])
  const dailyGoal = resolveDailyGoal(prefs)

  const defaultDuration = resolveExamDurationMin(prefs, config?.defaultTimerMin)
  const hideAnswered = shouldHideRepeats(prefs)

  // Hide fully-answered modules while "hide repeats" is on. Empty modules
  // stay visible (unchanged behavior); books left with nothing hide too.
  const visibleBooks = React.useMemo(() => {
    if (!books || !hideAnswered) return books

    return books
      .map((b) => ({
        ...b,
        modules: b.modules.filter(
          (m) => m.questionCount === 0 || (m.answeredCount ?? 0) < m.questionCount,
        ),
      }))
      .filter((b) => b.modules.length > 0)
  }, [books, hideAnswered])

  const load = React.useCallback(async () => {
    setLoading(true)
    // Independent outcomes: a failure of a side widget (daily goal, resume
    // banner) must never blank the whole book catalog.
    const booksP = apiFetch<{ books: BookWithModules[] }>("/api/books")
      .then((r) => setBooks(r.books))
      .catch(() => setBooks([]))
    const ipP = apiFetch<{ session: InProgressSession | null }>("/api/exam/in-progress")
      .then((r) => setInProgress(r.session))
      .catch(() => setInProgress(null))
    const dpP = apiFetch<{ todayAnswered: number; date: string }>("/api/user/daily-progress")
      .then((r) => setDailyAnswered(r.todayAnswered))
      .catch(() => setDailyAnswered(null))
    await Promise.allSettled([booksP, ipP, dpP])
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const startExam = async (moduleId: string, durationMin?: number, practice?: boolean) => {
    setStartingId(moduleId)
    try {
      const res = await apiFetch<StartResult>("/api/exam/start", {
        method: "POST",
        body: JSON.stringify({ moduleId, durationMin, practice }),
      })
      enterExam(res.session.sessionId, moduleId)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "شروع آزمون ناموفق بود",
        description: err instanceof ApiError ? err.message : "دوباره تلاش کنید.",
      })
    } finally {
      setStartingId(null)
    }
  }

  const fieldLabel =
    user?.field === "FANI_HERFEI" ? "شبکه" : "حسابداری"

  return (
    <div className="space-y-4">
      <section className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-balance">کتاب‌های {fieldLabel}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
            یک پودمان را باز کنید و آزمون را آغاز کنید.
          </p>
        </div>
      </section>

      {/* Resume in-progress exam banner */}
      <AnimatePresence>
        {inProgress && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border-2 border-foreground/10 bg-card p-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground shrink-0">
                <Clock className="size-5" strokeWidth={ICON_STROKE} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {inProgress.moduleTitle}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  آزمون ناتمام —{" "}
                  <FaNum>{inProgress.totalQuestions}</FaNum> سوال
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => enterExam(inProgress.id, inProgress.moduleId)}
                className="shrink-0 cursor-pointer"
              >
                <RotateCcw className="size-3.5" strokeWidth={ICON_STROKE_ACTION} />
                ادامه
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daily goal tracker */}
      {dailyAnswered !== null && (
        <DailyGoalCard answered={dailyAnswered} goal={dailyGoal} />
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !books || books.length === 0 ? (
        <EmptyState />
      ) : visibleBooks && visibleBooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">همه پودمان‌ها پاسخ داده شده‌اند 🎉</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            چون «حذف سوالات تکراری» روشن است، پودمان تمام‌شده نمایش داده نمی‌شود.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 cursor-pointer"
            onClick={() => setView("settings")}
          >
            تغییر در تنظیمات
          </Button>
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={[(visibleBooks ?? books)[0]?.id]} className="space-y-3">
          {(visibleBooks ?? books).map((book, idx) => (
            <motion.div
              key={book.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05, ease: [0.2, 0, 0, 1] }}
            >
            <AccordionItem
              value={book.id}
              className="rounded-lg border border-border bg-card card-elevated overflow-hidden transition-colors hover:border-foreground/20"
            >
              <AccordionTrigger className="px-4 py-3.5 hover:no-underline cursor-pointer group" hideChevron>
                <div className="flex items-center gap-3 flex-1 text-right">
                  <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <BookOpen className="size-4" strokeWidth={ICON_STROKE} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{book.title}</p>
                    {book.field === null && (
                      <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        مشترک — هر دو رشته
                      </span>
                    )}
                  </div>
                </div>
                <ChevronLeft
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-data-[state=open]:-rotate-90"
                  aria-hidden
                />
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-2">
                <ul className="space-y-1">
                  {book.modules.map((m) => (
                    <li key={m.id}>
                      <div className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                            <FileQuestion className="size-3" strokeWidth={ICON_STROKE} />
                            <span>
                              <FaNum>{m.questionCount}</FaNum> سوال
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setDurationPicker({ moduleId: m.id, moduleTitle: m.title })}
                          onMouseEnter={preloadExamView}
                          onFocus={preloadExamView}
                          disabled={startingId === m.id || m.questionCount === 0}
                          className="cursor-pointer shrink-0"
                        >
                          {startingId === m.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Play className="size-3.5" strokeWidth={ICON_STROKE_ACTION} fill="currentColor" />
                          )}
                          شروع
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      )}

      {/* Duration picker dialog */}
      {durationPicker && (
        <DurationPickerDialog
          moduleTitle={durationPicker.moduleTitle}
          starting={startingId === durationPicker.moduleId}
          initialDuration={defaultDuration}
          onClose={() => setDurationPicker(null)}
          onStart={(durationMin, practice) => {
            if (durationPicker) {
              void startExam(durationPicker.moduleId, durationMin, practice)
            }
          }}
        />
      )}
    </div>
  )
}

function DurationPickerDialog({
  moduleTitle,
  starting,
  initialDuration,
  onClose,
  onStart,
}: {
  moduleTitle: string
  starting: boolean
  initialDuration: number
  onClose: () => void
  onStart: (durationMin: number, practice: boolean) => void
}) {

  const [practice, setPractice] = React.useState(false)

  const durations = [
    { min: 5, label: "۵ دقیقه", desc: "مرور سریع" },
    { min: 10, label: "۱۰ دقیقه", desc: "آزمون کوتاه" },
    { min: 20, label: "۲۰ دقیقه", desc: "استاندارد" },
    { min: 30, label: "۳۰ دقیقه", desc: "آزمون کامل" },
    { min: 45, label: "۴۵ دقیقه", desc: "وقت زیاد" },
    { min: 60, label: "۶۰ دقیقه", desc: "بدون محدودیت" },
  ]

  // Preselect the resolved default when it is one of the offered options.
  const [selected, setSelected] = React.useState(
    durations.some((d) => d.min === initialDuration) ? initialDuration : 20,
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>شروع آزمون</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground truncate">{moduleTitle}</p>

          {/* Practice mode toggle */}
          <button
            type="button"
            onClick={() => setPractice((p) => !p)}
            aria-pressed={practice}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer text-right",
              practice
                ? "border-foreground bg-foreground/[0.06]"
                : "border-border hover:bg-accent/50",
            )}
          >
            <div className={cn(
              "flex size-9 items-center justify-center rounded-md shrink-0",
              practice ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
            )}>
              <BookOpen className="size-4" strokeWidth={ICON_STROKE} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">حالت تمرین</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                بدون تایمر، با نمایش پاسخ صحیح بعد از هر سوال
              </p>
            </div>
            <div className={cn(
              "flex size-5 items-center justify-center rounded-full border-2 shrink-0",
              practice ? "border-foreground bg-foreground" : "border-muted-foreground",
            )}>
              {practice && <Check className="size-3 text-background" strokeWidth={ICON_STROKE_BADGE} />}
            </div>
          </button>

          {!practice && (
            <>
              <p className="text-xs font-medium text-foreground/80 mb-1">زمان آزمون را انتخاب کنید:</p>
              <div className="grid grid-cols-2 gap-2">
                {durations.map((d) => (
                  <button
                    key={d.min}
                    type="button"
                    onClick={() => setSelected(d.min)}
                    className={cn(
                      "rounded-lg border p-3 text-center transition-colors cursor-pointer",
                      selected === d.min
                        ? "border-foreground bg-foreground/[0.06]"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <p className={cn("text-sm font-bold tabular-nums", selected === d.min && "text-foreground")}>
                      <FaNum>{d.label}</FaNum>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{d.desc}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            انصراف
          </Button>
          <Button
            onClick={() => onStart(selected, practice)}
            disabled={starting}
            className="cursor-pointer"
          >
            {starting && <Loader2 className="size-4 animate-spin" />}
            {practice ? "شروع تمرین" : "شروع آزمون"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      className="flex flex-col items-center justify-center text-center px-6 py-12 rounded-xl border border-dashed border-border bg-card/50"
    >
      <div className="relative flex size-16 items-center justify-center mb-4">
        <div className="absolute inset-0 rounded-full bg-secondary" />
        <div className="absolute inset-0 rounded-full ring-1 ring-border" />
        <BookOpen className="relative size-7 text-muted-foreground" strokeWidth={ICON_STROKE_DISPLAY} />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        هنوز محتوایی برای رشته شما ثبت نشده است.
      </h3>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed max-w-xs">
        مدیر سامانه در حال افزودن کتاب‌ها و پودمان‌ها است. بعداً دوباره بررسی کنید.
      </p>
    </motion.div>
  )
}

function DailyGoalCard({ answered, goal }: { answered: number; goal: number }) {
  const pct = Math.min(100, Math.round((answered / goal) * 100))
  const remaining = Math.max(0, goal - answered)
  const achieved = answered >= goal
  const circumference = 2 * Math.PI * 20

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      className="rounded-xl border border-border bg-card p-4 flex items-center gap-4"
    >
      {/* progress ring */}
      <div className="relative size-14 shrink-0">
        <svg className="size-14 -rotate-90" viewBox="0 0 48 48">
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="4"
          />
          <motion.circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={achieved ? "var(--success)" : "var(--foreground)"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
            transition={{ duration: 1.0, ease: [0.2, 0, 0, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {achieved ? (
            <Check className="size-5 text-success" strokeWidth={ICON_STROKE_BADGE} />
          ) : (
            <span className="text-[11px] font-bold tabular-nums">
              <FaNum>{pct}</FaNum>٪
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {achieved ? "هدف امروز محقق شد! 🎉" : "هدف امروز"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {achieved ? (
            <><FaNum>{answered}</FaNum> سوال پاسخ داده‌اید — ادامه دهید!</>
          ) : (
            <>
              <FaNum>{answered}</FaNum> از <FaNum>{goal}</FaNum> سوال —{" "}
              <FaNum>{remaining}</FaNum> سوال باقی مانده
            </>
          )}
        </p>
      </div>
    </motion.div>
  )
}
