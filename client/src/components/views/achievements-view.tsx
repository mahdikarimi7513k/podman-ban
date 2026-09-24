
import * as React from "react"
import { motion } from "framer-motion"
import {
  Footprints,
  Flame,
  Target,
  FileQuestion,
  Star,
  Trophy,
  Brain,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { FaNum } from "@/components/fa-utils"
import { cn, ICON_STROKE, ICON_STROKE_DISPLAY, ICON_STROKE_LARGE } from "@/lib/utils";

interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  progress?: { current: number; target: number }
}

interface AchievementsData {
  achievements: Achievement[]
  stats: {
    totalExams: number
    totalQuestions: number
    totalCorrect: number
    bestScore: number
    streak: number
    unlockedCount: number
  }
}

const ICON_MAP: Record<string, LucideIcon> = {
  Footprints,
  Flame,
  Target,
  FileQuestion,
  Star,
  Trophy,
  Brain,
}

export function AchievementsView() {
  const [data, setData] = React.useState<AchievementsData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<AchievementsData>("/api/user/achievements")
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
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { achievements, stats } = data
  const unlocked = achievements.filter((a) => a.unlocked)
  const locked = achievements.filter((a) => !a.unlocked)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">دستاوردها</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          با تلاش مداوم نشان‌ها را باز کنید.
        </p>
      </div>

      {/* Stats summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-xl font-bold tabular-nums">
              <FaNum>{stats.unlockedCount}</FaNum>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">نشان باز</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums">
              <FaNum>{stats.streak}</FaNum>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">روز پیاپی</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums">
              <FaNum>{stats.totalExams}</FaNum>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">آزمون</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums">
              <FaNum>{stats.bestScore}</FaNum>٪
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">بهترین</p>
          </div>
        </div>
      </motion.div>

      {/* Unlocked achievements */}
      {unlocked.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
            نشان‌های بازشده
            <span className="text-[11px] text-muted-foreground font-normal">
              (<FaNum>{unlocked.length}</FaNum> از <FaNum>{achievements.length}</FaNum>)
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {unlocked.map((a, idx) => (
              <AchievementCard key={a.id} achievement={a} delay={idx * 0.05} />
            ))}
          </div>
        </section>
      )}

      {/* Locked achievements */}
      {locked.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
            در راه
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {locked.map((a, idx) => (
              <AchievementCard key={a.id} achievement={a} delay={idx * 0.05} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AchievementCard({
  achievement,
  delay,
}: {
  achievement: Achievement
  delay: number
}) {
  const Icon = ICON_MAP[achievement.icon] ?? Star
  const { unlocked, progress } = achievement
  const pct =
    progress && progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay, ease: [0.2, 0, 0, 1] }}
      className={cn(
        "rounded-xl border p-4 flex flex-col items-center text-center",
        unlocked
          ? "border-foreground/20 bg-card card-elevated"
          : "border-border bg-card/50",
      )}
    >
      {/* icon */}
      <div
        className={cn(
          "relative flex size-14 items-center justify-center rounded-full mb-2",
          unlocked ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
        )}
      >
        {unlocked ? (
          <Icon className="size-7" strokeWidth={ICON_STROKE_LARGE} />
        ) : (
          <>
            <Icon className="size-6 opacity-30" strokeWidth={ICON_STROKE_DISPLAY} />
            <Lock className="absolute size-4" strokeWidth={ICON_STROKE} />
          </>
        )}
      </div>

      <p className={cn("text-sm font-semibold", !unlocked && "text-muted-foreground")}>
        {achievement.title}
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
        {achievement.description}
      </p>

      {/* progress bar */}
      {progress && !unlocked && (
        <div className="w-full mt-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            <FaNum>{progress.current}</FaNum> / <FaNum>{progress.target}</FaNum>
          </p>
        </div>
      )}

      {unlocked && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium">
          <Star className="size-3" fill="currentColor" />
          باز شد
        </span>
      )}
    </motion.div>
  )
}
