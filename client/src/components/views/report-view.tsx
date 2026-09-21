
import * as React from "react"
import { motion } from "framer-motion"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  TrendingUp,
  History,
  CalendarDays,
  Eye,
  PieChart as PieIcon,
} from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FaNum, ToPersianDigits } from "@/components/fa-utils"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { Button } from "@/components/ui/button"

interface ModuleProgress {
  moduleId: string
  moduleTitle: string
  bookTitle: string
  attempts: number
  lastScorePercent: number | null
  bestScorePercent: number | null
  lastFinishedAt: string | null
}

interface SessionRow {
  id: string
  moduleId: string
  scorePercent: number
  correctCount: number
  wrongCount: number
  skippedCount: number
  totalQuestions: number
  negativeMarking: boolean
  finishedAt: string | null
  moduleTitle: string
  bookTitle: string
}

interface AnswerStats {
  totalCorrect: number
  totalWrong: number
  totalSkipped: number
  totalQuestions: number
  totalSessions: number
  byBook: Array<{ book: string; correct: number; wrong: number; skipped: number }>
}

/** Group finished sessions under their book (stable book order of first appearance). */
export function groupSessionsByBook(sessions: SessionRow[]): Array<{ book: string; rows: SessionRow[] }> {
  const groups = new Map<string, SessionRow[]>()

  for (const s of sessions) {
    const list = groups.get(s.bookTitle) ?? []
    list.push(s)
    groups.set(s.bookTitle, list)
  }

  return Array.from(groups.entries()).map(([book, rows]) => ({ book, rows }))
}

type Status = "good" | "medium" | "bad" | "none"

function statusFor(score: number | null): Status {
  if (score === null) return "none"
  if (score >= 50) return "good"
  if (score >= 25) return "medium"
  return "bad"
}

const STATUS_META: Record<
  Status,
  { label: string; icon: typeof CheckCircle2; className: string; color: string }
> = {
  good: { label: "خوب", icon: CheckCircle2, className: "text-success", color: "var(--success)" },
  medium: { label: "متوسط", icon: AlertTriangle, className: "text-warning", color: "var(--warning)" },
  bad: { label: "نیازمند تلاش", icon: XCircle, className: "text-destructive", color: "var(--destructive)" },
  none: { label: "بدون آزمون", icon: Circle, className: "text-muted-foreground", color: "var(--muted-foreground)" },
}

interface HeatmapData {
  days: { date: string; count: number; label: string; dayNum: number }[]
  max: number
  total: number
  activeDays: number
  range: number
}

export function ReportView() {
  const enterExam = useApp((s) => s.enterExam)
  const [progress, setProgress] = React.useState<ModuleProgress[] | null>(null)
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null)
  const [stats, setStats] = React.useState<AnswerStats | null>(null)
  const [heatmap, setHeatmap] = React.useState<HeatmapData | null>(null)
  const [heatmapRange, setHeatmapRange] = React.useState<7 | 30>(7)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Each widget fails independently — one broken endpoint must not blank
      // the entire report page.
      const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
        p.catch(() => fallback)
      const [p, s, st] = await Promise.all([
        safe(apiFetch<{ progress: ModuleProgress[] }>("/api/exam/progress"), { progress: [] }),
        safe(apiFetch<{ sessions: SessionRow[] }>("/api/exam/sessions"), { sessions: [] }),
        safe(apiFetch<{ stats: AnswerStats }>("/api/exam/stats"), { stats: null as AnswerStats | null }),
      ])
      if (cancelled) return
      setProgress(p.progress)
      setSessions(s.sessions)
      setStats(st.stats)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, []) // initial load only

  // THE heatmap fetch — runs on mount and whenever the range toggles.
  React.useEffect(() => {
    let cancelled = false
    apiFetch<HeatmapData>(`/api/user/heatmap?range=${heatmapRange}`)
      .then((hm) => {
        if (!cancelled) setHeatmap(hm)
      })
      .catch(() => {
        /* widget fails alone */
      })
    return () => {
      cancelled = true
    }
  }, [heatmapRange])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  const totalAttempts =
    progress?.reduce((a, m) => a + m.attempts, 0) ?? 0
  const scoredModules = progress?.filter((m) => m.lastScorePercent !== null) ?? []
  const avgScore =
    scoredModules.length > 0
      ? Math.round(
          scoredModules.reduce((a, m) => a + (m.lastScorePercent ?? 0), 0) /
            scoredModules.length,
        )
      : 0
  const bestScore = scoredModules.reduce(
    (a, m) => Math.max(a, m.bestScorePercent ?? 0),
    0,
  )

  // chart data: score trend over recent sessions (chronological, oldest → newest)
  const trendData = (sessions ?? [])
    .slice()
    .reverse()
    .slice(-10)
    .map((s, i) => ({
      idx: i + 1,
      score: s.scorePercent,
      label: `آزمون ${i + 1}`,
    }))



  const hasData = totalAttempts > 0

  const donutData = stats
    ? [
        { name: "صحیح", value: stats.totalCorrect, color: "var(--success)" },
        { name: "غلط", value: stats.totalWrong, color: "var(--destructive)" },
        { name: "نزده", value: stats.totalSkipped, color: "var(--muted-foreground)" },
      ].filter((d) => d.value > 0)
    : []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-balance">کارنامه</h1>
        <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
          وضعیت آزمون‌های شما به تفکیک پودمان.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="آزمون‌های انجام‌شده" value={totalAttempts} />
        <StatCard label="میانگین درصد" value={avgScore} suffix="٪" />
        <StatCard label="بهترین درصد" value={bestScore} suffix="٪" />
        <StatCard label="پودمان‌ها" value={progress?.length ?? 0} />
      </div>

      {/* Activity heatmap */}
      {heatmap && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="size-4 text-muted-foreground" strokeWidth={2} />
            <h2 className="text-sm font-semibold">فعالیت مطالعاتی</h2>
            <span className="text-[11px] text-muted-foreground mr-auto">
              <FaNum>{heatmap.total}</FaNum> سوال در{" "}
              <FaNum>{heatmap.activeDays}</FaNum> روز فعال
            </span>
          </div>
          {/* range toggle */}
          <div className="flex gap-1 mb-3">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setHeatmapRange(r)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                  heatmapRange === r
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                )}
              >
                <FaNum>{r}</FaNum> روز
              </button>
            ))}
          </div>
          {heatmap.range === 7 ? (
            // 7-day bar chart
            <div className="flex items-end justify-between gap-1.5 h-20">
              {heatmap.days.map((d, i) => {
                const pct = d.count === 0 ? 0 : Math.max(15, Math.round((d.count / heatmap.max) * 100))
                const isToday = i === heatmap.days.length - 1
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex-1 flex items-end">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${pct}%` }}
                        transition={{ duration: 0.4, delay: i * 0.05, ease: [0.2, 0, 0, 1] }}
                        className={`w-full rounded-md ${
                          d.count === 0
                            ? "bg-muted"
                            : isToday
                              ? "bg-foreground"
                              : "bg-foreground/70"
                        }`}
                        title={`${d.label}: ${d.count} سوال`}
                        style={{ minHeight: d.count > 0 ? 8 : 2 }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{d.label}</span>
                    {d.count > 0 && (
                      <span className="text-[9px] font-medium tabular-nums">
                        <FaNum>{d.count}</FaNum>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            // 30-day grid heatmap (GitHub-style)
            <div className="grid grid-cols-10 gap-1" dir="ltr">
              {heatmap.days.map((d, i) => {
                const intensity =
                  d.count === 0
                    ? "bg-muted"
                    : d.count / heatmap.max > 0.66
                      ? "bg-foreground"
                      : d.count / heatmap.max > 0.33
                        ? "bg-foreground/60"
                        : "bg-foreground/30"
                return (
                  <motion.div
                    key={d.date}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.01, ease: [0.2, 0, 0, 1] }}
                    className={`aspect-square rounded-sm ${intensity} hover:ring-1 hover:ring-foreground cursor-default`}
                    title={`${d.date}: ${d.count} سوال`}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Score trend chart */}
      {hasData && trendData.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-muted-foreground" strokeWidth={2} />
            <h2 className="text-sm font-semibold">روند پیشرفت</h2>
            <span className="text-[11px] text-muted-foreground mr-auto">
              ۱۰ آزمون اخیر
            </span>
          </div>
          <div className="h-44 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trendData}
                margin={{ top: 5, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="idx"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tickFormatter={(v) => ToPersianDigits(v)}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  tickFormatter={(v) => ToPersianDigits(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--foreground)",
                  }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(v: number) => [ToPersianDigits(v) + "٪", "درصد"]}
                  labelFormatter={(l) => "آزمون " + ToPersianDigits(Number(l))}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                  dot={{
                    fill: "var(--foreground)",
                    r: 3,
                    strokeWidth: 0,
                  }}
                  activeDot={{
                    r: 5,
                    fill: "var(--foreground)",
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Answer distribution donut chart */}
      {hasData && stats && stats.totalQuestions > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="size-4 text-muted-foreground" strokeWidth={2} />
            <h2 className="text-sm font-semibold">توزیع پاسخ‌ها</h2>
            <span className="text-[11px] text-muted-foreground mr-auto">
              مجموع <FaNum>{stats.totalQuestions}</FaNum> سوال
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="size-36 shrink-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={60}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(v: number, n: string) => [ToPersianDigits(v) + " سوال", n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              <DistributionRow
                label="صحیح"
                value={stats.totalCorrect}
                total={stats.totalQuestions}
                color="var(--success)"
                icon={CheckCircle2}
              />
              <DistributionRow
                label="غلط"
                value={stats.totalWrong}
                total={stats.totalQuestions}
                color="var(--destructive)"
                icon={XCircle}
              />
              <DistributionRow
                label="نزده"
                value={stats.totalSkipped}
                total={stats.totalQuestions}
                color="var(--muted-foreground)"
                icon={Circle}
              />
            </div>
          </div>
        </section>
      )}

      {/* Module progress list */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="size-4 text-muted-foreground" strokeWidth={2} />
          <h2 className="text-sm font-semibold">وضعیت آزمون‌ها</h2>
        </div>
        <ul className="space-y-2">
          {progress?.map((m) => {
            const st = statusFor(m.lastScorePercent)
            const meta = STATUS_META[st]
            const Icon = meta.icon
            return (
              <li
                key={m.moduleId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-accent/30"
              >
                <Icon className={cn("size-5 shrink-0", meta.className)} strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.moduleTitle}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {m.bookTitle}
                    {" — "}
                    <FaNum>{m.attempts}</FaNum> آزمون
                    {m.bestScorePercent !== null && (
                      <>{" — "}بهترین: <FaNum>{m.bestScorePercent}</FaNum>٪</>
                    )}
                  </p>
                </div>
                <div className="text-left shrink-0">
                  <p className={cn("text-lg font-bold tabular-nums leading-none", meta.className)}>
                    {m.lastScorePercent !== null ? (
                      <FaNum>{m.lastScorePercent}</FaNum>
                    ) : (
                      "—"
                    )}
                    <span className="text-xs">٪</span>
                  </p>
                  <p className={cn("text-[10px] mt-0.5", meta.className)}>
                    {meta.label}
                  </p>
                </div>
              </li>
            )
          })}
          {progress?.length === 0 && (
            <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              هنوز پودمانی برای رشته شما تعریف نشده است.
            </li>
          )}
        </ul>
      </section>

      {/* Recent sessions, grouped under their book */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <History className="size-4 text-muted-foreground" strokeWidth={2} />
          <h2 className="text-sm font-semibold">آخرین آزمون‌ها</h2>
        </div>
        {sessions && sessions.length > 0 ? (
          <Accordion
            type="multiple"
            defaultValue={[groupSessionsByBook(sessions)[0]?.book ?? ""]}
            className="space-y-2"
          >
            {groupSessionsByBook(sessions).map((g) => (
              <AccordionItem
                key={g.book}
                value={g.book}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <AccordionTrigger className="px-3.5 py-3 hover:no-underline cursor-pointer">
                  <span className="text-sm font-semibold truncate">{g.book}</span>
                  <span className="text-[11px] text-muted-foreground mr-auto pl-1 shrink-0">
                    <FaNum>{g.rows.length}</FaNum> آزمون
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  <ul className="space-y-1.5">
                    {g.rows.map((s) => (
                      <SessionRowItem key={s.id} s={s} onReview={() => enterExam(s.id, s.moduleId)} />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            هنوز آزمونی نزده‌اید.
          </div>
        )}
      </section>
    </div>
  )
}

function SessionRowItem({ s, onReview }: { s: SessionRow; onReview: () => void }) {
  const st = statusFor(s.scorePercent)
  const meta = STATUS_META[st]

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{s.moduleTitle}</p>
        <p className="text-[11px] text-muted-foreground">
          <FaNum>{s.correctCount}</FaNum> صحیح،{" "}
          <FaNum>{s.wrongCount}</FaNum> غلط،{" "}
          <FaNum>{s.skippedCount}</FaNum> نزده
        </p>
      </div>
      <div className="text-left shrink-0">
        <p className={cn("text-base font-bold tabular-nums", meta.className)}>
          <FaNum>{s.scorePercent}</FaNum>٪
        </p>
        {s.finishedAt && (
          <p className="text-[10px] text-muted-foreground">
            {formatDate(s.finishedAt)}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onReview}
        className="cursor-pointer shrink-0"
      >
        <Eye className="size-3.5" strokeWidth={2.25} />
        تشریحی
      </Button>
    </li>
  )
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string
  value: number
  suffix?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xl font-bold tabular-nums">
        <FaNum>{value}</FaNum>
        {suffix && <span className="text-sm">{suffix}</span>}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{label}</p>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d)
  } catch {
    return ""
  }
}


/** A distribution row with icon, label, count, percentage, and a progress bar. */
function DistributionRow({
  label,
  value,
  total,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  total: number
  color: string
  icon: typeof CheckCircle2
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0" style={{ color }} strokeWidth={2} />
      <span className="text-xs font-medium w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-12 text-left shrink-0">
        <FaNum>{value}</FaNum> (<FaNum>{pct}</FaNum>٪)
      </span>
    </div>
  )
}
