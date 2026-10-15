/**
 * Study rooms (اتاق مطالعه): overview countdown, rooms list, room detail
 * with live focus timer + leaderboard, and room creation.
 *
 * Timer truth lives on the server (startedAt/accumulatedMs); the client only
 * renders wall-clock elapsed, so backgrounding, throttled intervals and even
 * app kills never lose time — re-entry resyncs from /active + serverNow.
 */
import * as React from "react"
import {
  Users,
  Plus,
  Minus,
  Copy,
  Check,
  Play,
  Pause,
  Square,
  LogOut,
  Loader2,
  ChevronRight,
  ChevronDown,
  Timer,
  Trophy,
  Target,
  UserMinus,
  Flag,
  Footprints,
  CalendarDays,
  Medal,
  Megaphone,
  Pencil,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { useApp } from "@/lib/store"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { FaNum } from "@/components/fa-utils"
import { useToast } from "@/hooks/use-toast"
import { isNativeApp } from "@/lib/native-notify"
import {
  showTimerNotification,
  clearTimerNotification,
  showTimerSummary,
} from "@/lib/study-timer-notify"
import { cn, ICON_STROKE } from "@/lib/utils"

type SubView = { name: "overview" } | { name: "rooms" } | { name: "detail"; roomId: string } | { name: "create" }

interface Overview {
  range: string
  totalMinutes: number
  goalMinutes: number
  subjects: Array<{ name: string; minutes: number }>
  konkur: { date: string; totalDays: number; months: number; days: number } | null
}

interface RoomPreviewUser {
  id: string
  name: string
  avatarBase64: string | null
}

interface RoomItem {
  id: string
  name: string
  type: "COMPETITIVE" | "FRIENDLY"
  capacity: number
  requireInvite: boolean
  memberCount: number
  studyingNow: number
  avgTodayMin: number
  preview: RoomPreviewUser[]
  joined: boolean
}

interface LeaderRow {
  id: string
  name: string
  avatarBase64: string | null
  todayMin: number
  weekMin: number
  status: "studying" | "paused" | "rest"
  isMe: boolean
}

interface RoomDetail {
  room: {
    id: string
    name: string
    type: "COMPETITIVE" | "FRIENDLY"
    capacity: number
    inviteCode: string | null
    memberCount: number
    studyingNow: number
    joined: boolean
    isOwner: boolean
  }
  leaderboard: LeaderRow[]
  mySession: { id: string; status: "ACTIVE" | "PAUSED"; elapsedMs: number; startedAt: string; serverNow: string } | null
  dailyChallenge: { text: string; goalMin: number; date: string | null; isToday: boolean; roomTodayMin: number } | null
  challenge: { weekMin: number; goalMin: number }
  serverNow: string
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatDur(min: number): string {
  if (min < 60) return `${min} دقیقه`
  const h = Math.floor(min / 60)
  const m = min % 60

  return m === 0 ? `${h} ساعت` : `${h} ساعت و ${m} دقیقه`
}

export function Avatar({ name, avatar, size = "size-9" }: { name: string; avatar: string | null; size?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-secondary text-xs font-semibold overflow-hidden shrink-0",
        size,
      )}
      aria-hidden
    >
      {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : name.charAt(0)}
    </span>
  )
}

export function StudyView() {
  const [sub, setSub] = React.useState<SubView>({ name: "overview" })

  return (
    <div className="space-y-4">
      {sub.name === "overview" && <OverviewScreen go={(s) => setSub(s)} />}
      {sub.name === "rooms" && <RoomsScreen go={(s) => setSub(s)} />}
      {sub.name === "detail" && <DetailScreen roomId={sub.roomId} go={(s) => setSub(s)} />}
      {sub.name === "create" && <CreateScreen go={(s) => setSub(s)} />}
    </div>
  )
}

// Academic-year window for the journey strip: each of the 12 segments is
// roughly a month of the road from شروع to کنکور.
const KONKUR_WINDOW_DAYS = 365

const KONKUR_SEGMENTS = 12

/**
 * Konkur journey card — project-specific "road to the exam" style.
 * Theme-native (card tokens, both themes) instead of a fixed gradient:
 * hero number, segmented month-strip with a live marker, milestone flags.
 */
function KonkurCountdown({ konkur }: { konkur: Overview["konkur"] }) {
  const progress = konkur
    ? Math.min(1, Math.max(0, 1 - konkur.totalDays / KONKUR_WINDOW_DAYS))
    : 0

  const filled = Math.round(progress * KONKUR_SEGMENTS)
  const elapsedDays = konkur ? Math.max(0, KONKUR_WINDOW_DAYS - konkur.totalDays) : 0

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold bg-primary/10 text-primary rounded-full px-4 py-1.5">
          تا کنکور فنی
        </span>
        <span className="ms-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" />
          مسیر فعال
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[40px] min-[380px]:text-5xl leading-none font-extrabold tabular-nums">
            {konkur ? <FaNum>{konkur.totalDays}</FaNum> : "—"}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {konkur ? (
              <>
                روز مانده · <FaNum>{konkur.months}</FaNum> ماه و <FaNum>{konkur.days}</FaNum> روز
              </>
            ) : (
              "تاریخ کنکور را مدیر تنظیم می‌کند"
            )}
          </p>
        </div>
        <div className="flex size-14 min-[380px]:size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shrink-0">
          <Flag className="size-7 min-[380px]:size-8" strokeWidth={ICON_STROKE} />
        </div>
      </div>

      {/* Month-strip journey: filled from شروع (right in RTL) to کنکور */}
      <div className="mt-5 flex gap-1.5" role="img" aria-label={`پیشرفت مسیر: ${Math.round(progress * 100)} درصد`}>
        {Array.from({ length: KONKUR_SEGMENTS }, (_, i) => {
          const isDone = i < filled
          const isCurrent = i === filled && filled < KONKUR_SEGMENTS

          return (
            <span
              key={i}
              className={cn(
                "h-3 flex-1 rounded-full transition-colors",
                isDone ? "bg-primary" : isCurrent ? "bg-primary/40 motion-safe:animate-pulse" : "bg-secondary",
              )}
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground px-0.5">
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3.5" strokeWidth={ICON_STROKE} />
          شروع
        </span>
        <span className="tabular-nums">
          <FaNum>{Math.round(progress * 100)}</FaNum>٪ مسیر
        </span>
        <span className="inline-flex items-center gap-1">
          کنکور
          <CalendarDays className="size-3.5" strokeWidth={ICON_STROKE} />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          <FaNum>{elapsedDays}</FaNum> روز رفته
        </span>
        <span className="tabular-nums">
          <FaNum>{konkur?.totalDays ?? "—"}</FaNum> روز فرصت داری
        </span>
      </div>
    </section>
  )
}

// ---------------- Overview ----------------

function OverviewScreen({ go }: { go: (s: SubView) => void }) {
  const [range, setRange] = React.useState<"today" | "week" | "month">("today")
  const [data, setData] = React.useState<Overview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [entering, setEntering] = React.useState(false)
  const { toast } = useToast()

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch<Overview>(`/api/study/overview?range=${range}`)
      setData(res)
    } catch {
      /* offline — keep previous */
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // Entering takes the user to THEIR room (most recently visited and
  // still joined, else the first joined room) — or the browser when they
  // belong nowhere (kicked/left). Choice remembered per device.
  const enter = async () => {
    setEntering(true)

    try {
      const res = await apiFetch<{ rooms: RoomItem[] }>("/api/study/rooms")
      const joined = res.rooms.filter((r) => r.joined)

      if (joined.length === 0) {
        go({ name: "rooms" })

        return
      }

      let target = joined[0]

      try {
        const last = window.localStorage.getItem("study:last-room")
        const remembered = joined.find((r) => r.id === last)

        if (remembered) target = remembered
      } catch {
        /* ignore */
      }

      if (!target) {
        go({ name: "rooms" })

        return
      }

      go({ name: "detail", roomId: target.id })
    } catch {
      toast({ variant: "destructive", title: "ورود ناموفق بود" })
    } finally {
      setEntering(false)
    }
  }

  const rangeLabel = range === "today" ? "امروز" : range === "week" ? "این هفته" : "این ماه"
  const pct = data && data.goalMinutes > 0 ? Math.min(100, Math.round((data.totalMinutes / data.goalMinutes) * 100)) : 0
  const maxSubject = Math.max(1, ...((data?.subjects ?? []).map((s) => s.minutes)))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">اتاق مطالعه</h1>
          <p className="text-sm text-muted-foreground mt-0.5">تا کنکور چقدر مانده و امروز چقدر خوندی</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => useApp.getState().setView("achievements")}
          className="h-11 shrink-0 cursor-pointer"
          aria-label="دستاوردها"
        >
          <Medal className="size-4" strokeWidth={ICON_STROKE} />
          دستاوردها
        </Button>
      </div>

      {/* Countdown card — matches the reference design exactly. */}
      <KonkurCountdown konkur={data?.konkur ?? null} />

      {/* Range tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1" role="tablist" aria-label="بازه">
        {(["today", "week", "month"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={cn(
              "rounded-lg py-2 text-xs font-medium transition-colors cursor-pointer",
              range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r === "today" ? "امروز" : r === "week" ? "این هفته" : "این ماه"}
          </button>
        ))}
      </div>

      {/* Total card */}
      <section className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-xs text-muted-foreground">مجموع مطالعه‌ی {rangeLabel}</p>
        {loading && !data ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground mx-auto my-3" />
        ) : (
          <p className="mt-1 text-2xl font-extrabold">
            <FaNum>{formatDur(data?.totalMinutes ?? 0)}</FaNum>
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          <FaNum>{pct}٪</FaNum> از هدف <FaNum>{formatDur(data?.goalMinutes ?? 180)}</FaNum>
        </p>
        <div className="mt-3 h-2.5 rounded-full bg-secondary overflow-hidden" dir="ltr">
          <div className="h-full rounded-full bg-gradient-to-r from-[#18A8FF] to-[#0878F9] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* Subjects */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        {(data?.subjects ?? []).map((s) => (
          <div key={s.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground tabular-nums">
                <FaNum>{s.minutes}</FaNum> دقیقه
              </span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden" dir="ltr">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#18A8FF] to-[#0878F9]"
                style={{ width: `${Math.round((s.minutes / maxSubject) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {(data?.subjects.length ?? 0) === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-2">هنوز مطالعه‌ای ثبت نشده — تایمر را در اتاق شروع کن.</p>
        )}
      </section>

      <Button onClick={() => void enter()} disabled={entering} className="w-full h-12 text-sm font-semibold cursor-pointer">
        {entering && <Loader2 className="size-4 animate-spin" />}
        ورود به اتاق مطالعه
      </Button>
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        مطالعه‌ی اتاق‌ها در آمار شخصی تو هم ثبت می‌شود.
      </p>
    </div>
  )
}

// ---------------- Rooms list ----------------

function RoomsScreen({ go }: { go: (s: SubView) => void }) {
  const { toast } = useToast()
  const [rooms, setRooms] = React.useState<RoomItem[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [code, setCode] = React.useState("")
  const [joining, setJoining] = React.useState(false)

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)

    try {
      const res = await apiFetch<{ rooms: RoomItem[] }>("/api/study/rooms")
      setRooms(res.rooms)
    } catch {
      if (!quiet) setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()

    // Visibility-gated: backgrounded tabs/APK views don't burn radio.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true)
    }, 15000)

    return () => window.clearInterval(id)
  }, [load])

  const join = async (payload: Record<string, string>) => {
    setJoining(true)

    try {
      const res = await apiFetch<{ room: { id: string } }>("/api/study/rooms/join", {
        method: "POST",
        body: JSON.stringify(payload),
      })

      setCode("")
      await load(true)
      go({ name: "detail", roomId: res.room.id })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ورود ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">اتاق‌های مطالعه</h1>
        <p className="text-sm text-muted-foreground mt-0.5">رقابت دوستانه، تمرکز بیشتر</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="کد دعوت را وارد کن"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          className="h-11 flex-1 min-w-0 text-center tracking-[0.3em]"
        />
        <Button
          disabled={code.length !== 6 || joining}
          onClick={() => void join({ inviteCode: code })}
          className="h-11 shrink-0 cursor-pointer"
        >
          {joining && <Loader2 className="size-4 animate-spin" />}
          ورود با کد
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0">
          <Users className="size-5" strokeWidth={ICON_STROKE} />
        </div>
        <div className="flex-1">
          <p className="font-bold">اتاق جدید بساز</p>
          <p className="text-xs text-muted-foreground mt-0.5">تایمر مشترک و جدول رتبه‌بندی زنده</p>
        </div>
        <Button onClick={() => go({ name: "create" })} className="cursor-pointer shrink-0">
          ساخت اتاق
        </Button>
      </section>

      <h2 className="text-sm font-semibold">اتاق‌های فعال</h2>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !rooms || rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          هنوز اتاقی ساخته نشده — اولین اتاق را تو بساز.
        </div>
      ) : (
        <ul className="space-y-3">
          {rooms.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] rounded-full px-2.5 py-1",
                    r.type === "COMPETITIVE" ? "bg-primary/10 text-primary" : "bg-success/10 text-success",
                  )}
                >
                  {r.type === "COMPETITIVE" ? "رقابتی" : "دوستانه"}
                </span>
                <p className="font-bold text-sm flex-1">{r.name}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <FaNum>{r.memberCount}</FaNum> نفر · <FaNum>{r.studyingNow}</FaNum> نفر در حال مطالعه
              </p>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2 space-x-reverse">
                  {r.preview.map((u) => (
                    <Avatar key={u.id} name={u.name} avatar={u.avatarBase64} size="size-8 border-2 border-card" />
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => void join({ roomId: r.id })}
                  disabled={joining}
                  className="ms-auto h-11 cursor-pointer"
                >
                  ورود
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                میانگین امروز <FaNum>{formatDur(r.avgTodayMin)}</FaNum>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground text-center">هر اتاق حداکثر ۳۰ نفر ظرفیت دارد.</p>
    </div>
  )
}

// ---------------- Room detail + timer ----------------

function DetailScreen({ roomId, go }: { roomId: string; go: (s: SubView) => void }) {
  const { toast } = useToast()
  const [detail, setDetail] = React.useState<RoomDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [now, setNow] = React.useState(() => Date.now())
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [consentOpen, setConsentOpen] = React.useState(false)
  const [showMembers, setShowMembers] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch<RoomDetail>(`/api/study/rooms/${roomId}`)

      setDetail(res)
      setNow(Date.parse(res.serverNow))

      try {
        window.localStorage.setItem("study:last-room", roomId)
      } catch {
        /* ignore */
      }
    } catch {
      /* keep previous on offline blips */
    } finally {
      setLoading(false)
    }
  }, [roomId])

  React.useEffect(() => {
    setLoading(true)
    void load()

    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 10000)

    const tick = window.setInterval(() => setNow((t) => t + 1000), 1000)

    // Backgrounded tabs throttle intervals: resync wall-clock on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }

    document.addEventListener("visibilitychange", onVisible)
    // Keep the CPU awake while focusing (best-effort; server is the truth).
    let wakeLock: { release: () => Promise<void> } | null = null

    // SAFETY: WakeLock lib types vary by TS version; probe the runtime
    // shape with an existence check instead of trusting the lib defs.
    const nav = navigator as Navigator & { wakeLock?: { request: (kind: string) => Promise<{ release: () => Promise<void> }> } }

    if (typeof nav.wakeLock !== "undefined") {
      nav.wakeLock.request("screen").then((l) => (wakeLock = l)).catch(() => {})
    }

    return () => {
      window.clearInterval(poll)
      window.clearInterval(tick)
      document.removeEventListener("visibilitychange", onVisible)
      void wakeLock?.release().catch(() => {})
    }
  }, [load])

  const elapsed = React.useMemo(() => {
    const s = detail?.mySession

    if (!s) return 0

    if (s.status === "PAUSED") return s.elapsedMs
    const started = Date.parse(s.startedAt)
    const serverNow = Date.parse(detail?.serverNow ?? new Date().toISOString())
    const skew = serverNow - Date.parse(s.serverNow)

    return s.elapsedMs + Math.max(0, now - started + skew)
  }, [detail, now])

  const act = async (path: "start" | "pause" | "resume" | "stop", body?: { roomId?: string }) => {
    setBusy(true)

    try {
      await apiFetch(`/api/study/session/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) })

      // Native progress ping: the timer lives on the server clock, but the
      // user only trusts what the phone tells them — a system notification
      // marks start/stop even outside the app. Best-effort, never blocking.
      if (path === "stop") {
        const mins = Math.max(1, Math.round(elapsed / 60000))

        await clearTimerNotification()
        await showTimerSummary(mins)
      }

      await load()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  // First start explains background truth + takes notification permission.
  // Android-APK only: on the website this flow does not exist — starting is
  // immediate (the server clock keeps the time everywhere regardless).
  const requestStart = () => {
    if (!isNativeApp()) {
      void beginFocusedSession()

      return
    }

    try {
      if (window.localStorage.getItem("study:bg-consent") === "1") {
        void beginFocusedSession()

        return
      }
    } catch {
      /* storage unavailable — ask every time */
    }

    setConsentOpen(true)
  }

  const beginFocusedSession = async () => {
    try {
      window.localStorage.setItem("study:bg-consent", "1")
    } catch {
      /* ignore */
    }

    setConsentOpen(false)
    await act("start", { roomId })

    // Ongoing shade presence (native only, no-op on web): the notice stays
    // while the session lives and carries a توقف action.
    if (isNativeApp()) {
      await showTimerNotification({
        roomId,
        roomName: detail?.room.name ?? "اتاق مطالعه",
        body: "تایمر روشن شد — زمانت روی سرور نگه داشته می‌شود.",
        ongoing: true,
      })
    }
  }

  const leave = async () => {
    if (!confirm("از اتاق خارج می‌شوی؟ تایمر فعال هم متوقف می‌شود.")) return

    try {
      await apiFetch(`/api/study/rooms/${roomId}/leave`, { method: "POST", body: JSON.stringify({}) })
      await clearTimerNotification()
      go({ name: "rooms" })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "خروج ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    }
  }

  // Shade-notice lifecycle (native only): re-show after a process kill,
  // refresh the elapsed text every minute, and mirror pause state.
  const sessionStatus = detail?.mySession?.status ?? null
  const roomName = detail?.room.name ?? "اتاق مطالعه"
  const elapsedRef = React.useRef(elapsed)

  elapsedRef.current = elapsed

  React.useEffect(() => {
    if (!isNativeApp() || !detail?.mySession) return

    const session = detail.mySession
    const mins = Math.max(0, Math.round(elapsedRef.current / 60000))

    void showTimerNotification({
      roomId,
      roomName,
      body:
        session.status === "PAUSED"
          ? `متوقف شده در ${formatDur(mins)} — برای ادامه وارد شو.`
          : `${formatDur(mins)} مطالعه تا اینجا — در حال اجرا.`,
      ongoing: true,
    })

    if (session.status !== "ACTIVE") return

    const id = window.setInterval(() => {
      const nowMin = Math.max(0, Math.round(elapsedRef.current / 60000))

      void showTimerNotification({
        roomId,
        roomName,
        body: `${formatDur(nowMin)} مطالعه تا اینجا — در حال اجرا.`,
        ongoing: true,
      })
    }, 60000)

    return () => window.clearInterval(id)
  }, [roomId, roomName, sessionStatus])

  if (loading && !detail) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        اتاق یافت نشد.
        <Button variant="link" onClick={() => go({ name: "rooms" })} className="cursor-pointer">بازگشت</Button>
      </div>
    )
  }

  const myRank = detail.leaderboard.findIndex((r) => r.isMe) + 1
  const nextUp = myRank > 1 ? detail.leaderboard[myRank - 2] : null
  const gapMin = nextUp ? Math.max(0, nextUp.todayMin - (detail.leaderboard[myRank - 1]?.todayMin ?? 0)) : 0

  const challengePct =
    detail.challenge.goalMin > 0 ? Math.min(100, Math.round((detail.challenge.weekMin / detail.challenge.goalMin) * 100)) : 0

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => go({ name: "rooms" })}
        className="inline-flex items-center gap-1 min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronRight className="size-4 rtl:rotate-180" />
        بازگشت به لیست
      </button>

      <div className="text-center">
        {/* Tapping the name reveals the member roster (with study
            activity for everyone; remove buttons for the owner). */}
        <button
          type="button"
          onClick={() => setShowMembers((v) => !v)}
          aria-expanded={showMembers}
          className="cursor-pointer rounded-lg px-2 py-1 hover:bg-accent/50 transition-colors"
        >
          <h1 className="text-xl font-bold inline">{detail.room.name}</h1>
          <ChevronDown className={cn("size-4 inline-block ms-1 transition-transform", showMembers && "rotate-180")} />
        </button>
        <p className="text-xs text-muted-foreground mt-0.5">
          <FaNum>{detail.room.memberCount}</FaNum> نفر · <FaNum>{detail.room.studyingNow}</FaNum> نفر در حال مطالعه
        </p>
      </div>

      {showMembers && (
        <MemberRoster
          roomId={detail.room.id}
          rows={detail.leaderboard}
          isOwner={detail.room.isOwner}
          onChanged={() => void load()}
        />
      )}

      <div className="flex items-center gap-2 justify-center">
        <span
          className={cn(
            "text-[11px] rounded-full px-3 py-1",
            detail.room.type === "COMPETITIVE" ? "bg-primary/10 text-primary" : "bg-success/10 text-success",
          )}
        >
          {detail.room.type === "COMPETITIVE" ? "رقابتی" : "دوستانه"}
        </span>
        {detail.room.inviteCode && (
          <button
            type="button"
            onClick={() => {
              const code = detail.room.inviteCode ?? ""
              void navigator.clipboard?.writeText(code).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }).catch(() => toast({ title: `کد دعوت: ${code}` }))
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] text-[11px] rounded-full px-3 py-1 border border-dashed border-primary text-primary cursor-pointer"
            dir="ltr"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            <FaNum>{detail.room.inviteCode}</FaNum>
            <span className="text-[10px]">کد دعوت</span>
          </button>
        )}
      </div>

      {/* Timer card */}
      <section className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-xs text-muted-foreground">زمان مطالعه‌ی تو در این نشست</p>
        <p className="text-4xl min-[380px]:text-5xl font-extrabold tabular-nums tracking-wider" dir="ltr">
          <FaNum>{formatClock(elapsed)}</FaNum>
        </p>
        {detail.room.type === "COMPETITIVE" && myRank > 0 && (
          <span className="inline-block text-[11px] rounded-full px-3 py-1 bg-success/10 text-success">
            {myRank === 1 ? (
              "رتبه ۱ — آفرین!"
            ) : (
              <>
                <FaNum>{gapMin}</FaNum> دقیقه تا رتبه <FaNum>{myRank - 1}</FaNum>
              </>
            )}
          </span>
        )}
        <div className="flex gap-2 justify-center pt-1">
          {!detail.mySession ? (
            <Button
              onClick={requestStart}
              disabled={busy}
              className="h-12 px-8 cursor-pointer"
            >
              <Play className="size-4" />
              شروع مطالعه
            </Button>
          ) : detail.mySession.status === "ACTIVE" ? (
            <>
              <Button onClick={() => void act("pause")} disabled={busy} variant="outline" className="h-12 px-6 cursor-pointer">
                <Pause className="size-4" />
                استراحت
              </Button>
              <Button onClick={() => void act("stop")} disabled={busy} variant="destructive" className="h-12 px-6 cursor-pointer">
                <Square className="size-4" />
                توقف و استراحت
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => void act("resume")} disabled={busy} className="h-12 px-8 cursor-pointer">
                <Play className="size-4" />
                ادامه
              </Button>
              <Button onClick={() => void act("stop")} disabled={busy} variant="destructive" className="h-12 px-6 cursor-pointer">
                <Square className="size-4" />
                پایان
              </Button>
            </>
          )}
        </div>
        {detail.mySession?.status === "PAUSED" && (
          <p className="text-[11px] text-muted-foreground">متوقفی — زمان برای تو نگه داشته شده.</p>
        )}
      </section>

      {/* Leaderboard */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold">جدول امتیاز امروز</h2>
          <span className="ms-auto inline-flex items-center gap-1 text-[10px] text-success">
            <span className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" />
            زنده
          </span>
        </div>
        <ul className="space-y-2">
          {detail.leaderboard.map((r, i) => (
            <li
              key={r.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                r.isMe ? "border-primary bg-primary/5" : "border-border bg-card",
              )}
            >
              <span className={cn("text-sm font-bold w-5 text-center tabular-nums", i === 0 ? "text-primary" : "text-muted-foreground")}>
                <FaNum>{i + 1}</FaNum>
              </span>
              <Avatar name={r.name} avatar={r.avatarBase64} size="size-10" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.isMe ? "تو" : r.name}</p>
                <p className={cn("text-[11px]", r.status === "studying" ? "text-success" : "text-muted-foreground")}>
                  {r.status === "studying" ? "در حال مطالعه" : r.status === "paused" ? "استراحت" : "استراحت"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                <FaNum>{formatDur(r.todayMin)}</FaNum>
              </span>
              {r.status === "studying" && <span className="size-2 rounded-full bg-success motion-safe:animate-pulse" />}
            </li>
          ))}
        </ul>
      </section>

      {/* Weekly challenge */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold">چالش هفتگی اتاق</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          <FaNum>{formatDur(detail.challenge.weekMin)}</FaNum> از <FaNum>{formatDur(detail.challenge.goalMin)}</FaNum>
        </p>
        <div className="h-2.5 rounded-full bg-secondary overflow-hidden" dir="ltr">
          <div className="h-full rounded-full bg-gradient-to-r from-[#18A8FF] to-[#0878F9]" style={{ width: `${challengePct}%` }} />
        </div>
      </section>

      <DailyChallengeCard
        roomId={detail.room.id}
        challenge={detail.dailyChallenge}
        isOwner={detail.room.isOwner}
        onChanged={() => void load()}
      />

      <Button variant="ghost" onClick={() => void leave()} className="w-full cursor-pointer text-destructive hover:text-destructive">
        <LogOut className="size-4" />
        خروج از اتاق
      </Button>

      <Dialog open={consentOpen} onOpenChange={(o) => !o && setConsentOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تایمر در پس‌زمینه کار می‌کند</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm leading-7 text-muted-foreground">
            <p>
              با زدن شروع، زمان از روی <span className="text-foreground font-medium">ساعت سرور</span> حساب
              می‌شود — حتی اگر برنامه را ببندی، گوشی زنگ بخورد یا اینترنت لحظه‌ای قطع شود، زمانت گم
              نمی‌شود. با برگشتن به اتاق، تایمر خودش به‌روز می‌شود.
            </p>
            <p>
              در نسخه برنامه (اندروید) برای اینکه خیالت راحت باشد، یک اعلان سیستمی هم برای شروع و
              پایان می‌فرستیم — لطفاً اجازه اعلان را بده.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsentOpen(false)} className="cursor-pointer">
              انصراف
            </Button>
            <Button onClick={() => void beginFocusedSession()} disabled={busy} className="cursor-pointer">
              {busy && <Loader2 className="size-4 animate-spin" />}
              متوجه شدم، شروع کن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Member roster: tapping the room name reveals it. Everyone sees names,
 * avatars and today-activity; the owner additionally gets remove buttons.
 */
function MemberRoster({
  roomId,
  rows,
  isOwner,
  onChanged,
}: {
  roomId: string
  rows: LeaderRow[]
  isOwner: boolean
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [removing, setRemoving] = React.useState<string | null>(null)

  const remove = async (row: LeaderRow) => {
    if (!confirm(`«${row.name}» از اتاق حذف شود؟`)) return

    setRemoving(row.id)

    try {
      await apiFetch(`/api/study/rooms/${roomId}/members/${row.id}/remove`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      toast({ title: "عضو حذف شد" })
      onChanged()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "حذف ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-3 space-y-1">
      <p className="text-xs text-muted-foreground px-1 pb-1">
        اعضای اتاق — فعالیت امروز همه اعضا برای همه قابل مشاهده است.
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-accent/40 transition-colors">
            <Avatar name={r.name} avatar={r.avatarBase64} size="size-9" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {r.isMe ? "تو" : r.name}
              </p>
              <p className={cn("text-[11px] tabular-nums", r.status === "studying" ? "text-success" : "text-muted-foreground")}>
                <FaNum>{formatDur(r.todayMin)}</FaNum> امروز ·{" "}
                {r.status === "studying" ? "در حال مطالعه" : "استراحت"}
              </p>
            </div>
            {isOwner && !r.isMe && (
              <button
                type="button"
                onClick={() => void remove(r)}
                disabled={removing === r.id}
                aria-label={`حذف ${r.name}`}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
              >
                {removing === r.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserMinus className="size-4" />
                )}
              </button>
            )}
            {r.status === "studying" && <span className="size-2 rounded-full bg-success motion-safe:animate-pulse shrink-0" />}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Daily challenge posted by the room owner: text + minutes goal for the
 * day, with the room's live today-total as progress. Everyone sees it;
 * only the owner gets the edit button.
 */
function DailyChallengeCard({
  roomId,
  challenge,
  isOwner,
  onChanged,
}: {
  roomId: string
  challenge: RoomDetail["dailyChallenge"]
  isOwner: boolean
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [goal, setGoal] = React.useState(120)
  const [saving, setSaving] = React.useState(false)

  const pct =
    challenge && challenge.goalMin > 0
      ? Math.min(100, Math.round((challenge.roomTodayMin / challenge.goalMin) * 100))
      : 0

  const save = async () => {
    if (text.trim().length < 2 || saving) return

    setSaving(true)

    try {
      await apiFetch(`/api/study/rooms/${roomId}/challenge`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim(), goalMin: goal }),
      })
      setOpen(false)
      toast({ title: "چالش امروز ثبت شد" })
      onChanged()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ثبت چالش ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Megaphone className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
        <h2 className="text-sm font-semibold">چالش امروز اتاق</h2>
        {challenge && !challenge.isToday && (
          <span className="text-[10px] rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
            مال قبل
          </span>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => {
              setText(challenge?.text ?? "")
              setGoal(challenge?.goalMin && challenge.goalMin >= 15 ? challenge.goalMin : 120)
              setOpen(true)
            }}
            aria-label={challenge ? "ویرایش چالش امروز" : "ثبت چالش امروز"}
            className="ms-auto min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>
      {challenge ? (
        <>
          <p dir="auto" className="text-sm font-medium leading-7 whitespace-pre-wrap">{challenge.text}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            مجموع امروز اتاق: <FaNum>{formatDur(challenge.roomTodayMin)}</FaNum> از <FaNum>{formatDur(challenge.goalMin)}</FaNum>
          </p>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden" dir="ltr">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isOwner ? "هنوز چالشی نگذاشتی — با مداد بالا چالش امروز را بنویس." : "سازنده اتاق هنوز چالش امروز را نگذاشته است."}
        </p>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>چالش امروز اتاق</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="challenge-text" className="text-xs">متن چالش</Label>
              <Textarea
                id="challenge-text"
                dir="auto"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="مثلاً: امروز هر نفر ۲ ساعت بخواند"
                className="resize-y min-h-[56px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="challenge-goal" className="text-xs">هدف (دقیقه برای کل اتاق)</Label>
              <Select value={String(goal)} onValueChange={(v) => setGoal(Number(v))}>
                <SelectTrigger id="challenge-goal" className="h-11 cursor-pointer" dir="ltr">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[30, 60, 120, 180, 240, 360, 480].map((m) => (
                    <SelectItem key={m} value={String(m)} className="cursor-pointer">
                      <FaNum>{m}</FaNum> دقیقه
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="cursor-pointer">
              انصراف
            </Button>
            <Button onClick={() => void save()} disabled={text.trim().length < 2 || saving} className="cursor-pointer">
              {saving && <Loader2 className="size-4 animate-spin" />}
              ثبت چالش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ---------------- Create ----------------
function CreateScreen({ go }: { go: (s: SubView) => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<"COMPETITIVE" | "FRIENDLY">("COMPETITIVE")
  const [capacity, setCapacity] = React.useState(20)
  const [requireInvite, setRequireInvite] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const submit = async () => {
    if (name.trim().length < 2 || saving) return
    setSaving(true)

    try {
      const res = await apiFetch<{ room: { id: string } }>("/api/study/rooms", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), type, capacity, requireInvite }),
      })

      toast({ title: "اتاق ساخته شد" })
      go({ name: "detail", roomId: res.room.id })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ساخت اتاق ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => go({ name: "rooms" })}
        className="inline-flex items-center gap-1 min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronRight className="size-4 rtl:rotate-180" />
        بازگشت
      </button>
      <div>
        <h1 className="text-xl font-bold">ساخت اتاق جدید</h1>
        <p className="text-sm text-muted-foreground mt-0.5">تنظیمات اتاق را انتخاب کن</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-name" className="text-sm font-semibold">نام اتاق</Label>
        <Input
          id="room-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً: ققنوس شب‌خوان"
          maxLength={60}
          className="h-12"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">نوع اتاق</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["COMPETITIVE", "رقابتی", "جدول رتبه‌بندی زنده"],
              ["FRIENDLY", "دوستانه", "بدون رتبه‌بندی"],
            ] as const
          ).map(([v, label, desc]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              aria-pressed={type === v}
              className={cn(
                "rounded-xl border p-4 text-center space-y-1 transition-colors cursor-pointer",
                type === v
                  ? "border-[#0878F9] bg-[#0878F9]/5 text-[#0878F9]"
                  : "border-border bg-card text-foreground hover:bg-accent/40",
              )}
            >
              <p className="font-bold text-sm">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">ظرفیت اتاق</Label>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <Button
            type="button"
            size="icon"
            onClick={() => setCapacity((c) => Math.min(30, c + 1))}
            disabled={capacity >= 30}
            aria-label="افزایش ظرفیت"
            className="rounded-full cursor-pointer size-11"
          >
            <Plus className="size-4" />
          </Button>
          <span className="text-sm font-bold tabular-nums">
            <FaNum>{capacity}</FaNum> نفر
          </span>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => setCapacity((c) => Math.max(2, c - 1))}
            disabled={capacity <= 2}
            aria-label="کاهش ظرفیت"
            className="rounded-full cursor-pointer size-11"
          >
            <Minus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Label htmlFor="invite-switch" className="text-sm font-semibold cursor-pointer">ورود به اتاق</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">فقط با کد دعوت</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">کد بعد از ساخت اتاق نمایش داده می‌شود</p>
          </div>
          <Switch id="invite-switch" checked={requireInvite} onCheckedChange={setRequireInvite} />
        </div>
      </div>

      <Button
        onClick={() => void submit()}
        disabled={name.trim().length < 2 || saving}
        className="w-full h-12 cursor-pointer"
      >
        {saving && <Loader2 className="size-4 animate-spin" />}
        ساخت اتاق
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">بعد از ساخت، کد دعوت برای دوستانت ساخته می‌شود.</p>
      <div className="flex items-center gap-2 justify-center text-muted-foreground">
        <Timer className="size-4" />
        <Users className="size-4" />
      </div>
    </div>
  )
}
