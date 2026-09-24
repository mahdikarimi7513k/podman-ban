
import * as React from "react"
import { motion } from "framer-motion"
import { Trophy, Medal, Award, TrendingUp, Crown } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { FaNum } from "@/components/fa-utils"
import { useApp } from "@/lib/store"
import { cn, ICON_STROKE, ICON_STROKE_DISPLAY, ICON_STROKE_LARGE } from "@/lib/utils";

interface LeaderRow {
  id: string
  name: string
  field: "FANI_HERFEI" | "KARDANESH"
  avg: number
  best: number
  count: number
  rank: number
}

interface LeaderboardData {
  leaderboard: LeaderRow[]
  myRank: number | null
  myStats: { avg: number; best: number; count: number } | null
  totalStudents: number
}

export function LeaderboardView() {
  const me = useApp((s) => s.user)
  const [data, setData] = React.useState<LeaderboardData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<LeaderboardData>("/api/exam/leaderboard")
        if (!cancelled) setData(res)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Trophy className="size-8 mx-auto text-muted-foreground/60" strokeWidth={ICON_STROKE_DISPLAY} />
        <p className="mt-3 text-sm font-medium">خطا در بارگذاری رتبه‌بندی</p>
      </div>
    )
  }

  const top3 = data.leaderboard.slice(0, 3)
  const rest = data.leaderboard.slice(3)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">رتبه‌بندی هنرجویان</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          برترین دانش‌آموزان بر اساس میانگین درصد آزمون‌ها.
        </p>
      </div>

      {/* My rank card */}
      {me && data.myStats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          className="rounded-xl border-2 border-foreground/15 bg-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-foreground text-background font-bold tabular-nums shrink-0">
              <FaNum>{data.myRank ?? "—"}</FaNum>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{me.name}</p>
              <p className="text-[11px] text-muted-foreground">
                رتبه‌ی شما از <FaNum>{data.totalStudents}</FaNum> هنرجو
              </p>
            </div>
            <div className="text-left shrink-0">
              <p className="text-2xl font-bold tabular-nums">
                <FaNum>{data.myStats.avg}</FaNum>
                <span className="text-sm">٪</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                میانگین شما
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-sm font-bold tabular-nums">
                <FaNum>{data.myStats.count}</FaNum>
              </p>
              <p className="text-[10px] text-muted-foreground">آزمون</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-sm font-bold tabular-nums">
                <FaNum>{data.myStats.best}</FaNum>٪
              </p>
              <p className="text-[10px] text-muted-foreground">بهترین</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-sm font-bold tabular-nums">
                <FaNum>{data.totalStudents}</FaNum>
              </p>
              <p className="text-[10px] text-muted-foreground">کل هنرجویان</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Top 3 podium */}
      {top3.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Crown className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
            <h2 className="text-sm font-semibold">نفرات برتر</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {top3.map((r, i) => {
              const actualRank = i + 1
              const Icon = actualRank === 1 ? Crown : actualRank === 2 ? Medal : Award
              const iconClass = actualRank === 1 ? "text-warning" : actualRank === 2 ? "text-muted-foreground" : "text-muted-foreground"
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08, ease: [0.2, 0, 0, 1] }}
                  className={cn(
                    "rounded-xl border bg-card p-3 flex flex-col items-center text-center",
                    actualRank === 1 ? "border-warning/30 order-2" : "border-border order-1",
                    actualRank === 3 && "order-3",
                  )}
                  style={{ marginTop: actualRank === 1 ? 0 : 8 }}
                >
                  <Icon className={cn("size-6 mb-1", iconClass)} strokeWidth={ICON_STROKE_LARGE} fill={actualRank === 1 ? "currentColor" : "none"} />
                  <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold mb-1.5">
                    {r.name.charAt(0)}
                  </div>
                  <p className="text-xs font-medium truncate w-full">{r.name}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    <FaNum>{r.avg}</FaNum>٪
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    رتبه‌ی <FaNum>{actualRank}</FaNum>
                  </p>
                </motion.div>
              )
            })}
          </div>
        </section>
      )}

      {/* Rest of the leaderboard */}
      {rest.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
            <h2 className="text-sm font-semibold">سایر هنرجویان</h2>
          </div>
          <ul className="space-y-1.5">
            {rest.map((r, idx) => {
              const isMe = r.id === me?.id
              return (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.24), ease: [0.2, 0, 0, 1] }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
                    isMe ? "border-foreground/20 bg-foreground/[0.03]" : "border-border hover:bg-accent/30",
                  )}
                >
                  <span className="w-7 text-center text-xs font-medium tabular-nums text-muted-foreground shrink-0">
                    <FaNum>{r.rank}</FaNum>
                  </span>
                  <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                    {r.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.name}
                      {isMe && <span className="text-[10px] text-muted-foreground mr-1">(شما)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <FaNum>{r.count}</FaNum> آزمون
                      {r.field === "FANI_HERFEI" ? " — شبکه" : " — حسابداری"}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums shrink-0">
                    <FaNum>{r.avg}</FaNum>٪
                  </span>
                </motion.li>
              )
            })}
          </ul>
        </section>
      )}

      {data.leaderboard.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Trophy className="size-8 mx-auto text-muted-foreground/60" strokeWidth={ICON_STROKE_DISPLAY} />
          <p className="mt-3 text-sm font-medium">هنوز آزمونی انجام نشده است.</p>
          <p className="text-xs text-muted-foreground mt-1">رتبه‌بندی بعد از اولین آزمون‌ها فعال می‌شود.</p>
        </div>
      )}
    </div>
  )
}
