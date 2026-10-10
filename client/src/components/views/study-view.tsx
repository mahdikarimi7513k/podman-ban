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
  Timer,
  Trophy,
  Target,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { FaNum } from "@/components/fa-utils"
import { useToast } from "@/hooks/use-toast"
import { isNativeApp, scheduleNativeNotification } from "@/lib/native-notify"
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
  }
  leaderboard: LeaderRow[]
  mySession: { id: string; status: "ACTIVE" | "PAUSED"; elapsedMs: number; startedAt: string; serverNow: string } | null
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

// ---------------- Overview ----------------

function OverviewScreen({ go }: { go: (s: SubView) => void }) {
  const [range, setRange] = React.useState<"today" | "week" | "month">("today")
  const [data, setData] = React.useState<Overview | null>(null)
  const [loading, setLoading] = React.useState(true)

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

  const rangeLabel = range === "today" ? "امروز" : range === "week" ? "این هفته" : "این ماه"
  const pct = data && data.goalMinutes > 0 ? Math.min(100, Math.round((data.totalMinutes / data.goalMinutes) * 100)) : 0
  const maxSubject = Math.max(1, ...((data?.subjects ?? []).map((s) => s.minutes)))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">اتاق مطالعه</h1>
        <p className="text-sm text-muted-foreground mt-0.5">تا کنکور چقدر مانده و امروز چقدر خوندی</p>
      </div>

      {/* Countdown card */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#18A8FF] via-[#0878F9] to-[#003CCB] text-white p-5">
        <svg className="absolute inset-x-0 bottom-0 w-full opacity-30" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden>
          <path d="M0 45 C 60 10, 120 10, 170 30 S 300 55, 400 25" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="28" cy="38" r="5" fill="white" />
        </svg>
        <div className="flex items-center justify-between">
          <span className="text-xs bg-white/20 rounded-full px-3 py-1">تا کنکور فنی</span>
        </div>
        <p className="mt-4 text-3xl font-extrabold tabular-nums">
          {data?.konkur ? (
            <>
              <FaNum>{data.konkur.months}</FaNum> ماه و <FaNum>{data.konkur.days}</FaNum> روز
            </>
          ) : (
            "به‌زودی"
          )}
        </p>
        <p className="mt-1 text-xs text-white/85">
          {data?.konkur ? (
            <>
              <FaNum>{data.konkur.totalDays}</FaNum> روز فرصت داری
            </>
          ) : (
            "تاریخ کنکور را مدیر تنظیم می‌کند"
          )}
        </p>
        <div className="mt-2 flex justify-between text-[10px] text-white/70">
          <span>الان</span>
          <span>شروع</span>
          <span>کنکور</span>
        </div>
      </section>

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

      <Button onClick={() => go({ name: "rooms" })} className="w-full h-12 text-sm font-semibold cursor-pointer bg-gradient-to-l from-[#18A8FF] to-[#0878F9] hover:opacity-90">
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
    const id = window.setInterval(() => void load(true), 15000)

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
          className="h-11 text-center tracking-[0.3em]"
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

      <section className="rounded-2xl bg-gradient-to-bl from-[#18A8FF] via-[#0878F9] to-[#003CCB] text-white p-5 flex items-center gap-3">
        <div className="flex-1">
          <p className="font-bold">اتاق جدید بساز</p>
          <p className="text-xs text-white/85 mt-0.5">تایمر مشترک و جدول رتبه‌بندی زنده</p>
        </div>
        <Button variant="secondary" onClick={() => go({ name: "create" })} className="cursor-pointer shrink-0">
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
                    r.type === "COMPETITIVE" ? "bg-[#0878F9]/10 text-[#0878F9]" : "bg-success/10 text-success",
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
                  size="sm"
                  onClick={() => void join({ roomId: r.id })}
                  disabled={joining}
                  className="ms-auto cursor-pointer border-[#0878F9] text-[#0878F9] hover:bg-[#0878F9]/10 hover:text-[#0878F9]"
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
      <p className="text-[11px] text-muted-foreground text-center">هر اتاق حداکثر ۲۰ نفر ظرفیت دارد.</p>
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

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch<RoomDetail>(`/api/study/rooms/${roomId}`)
      setDetail(res)
      setNow(Date.parse(res.serverNow))
    } catch {
      /* keep previous on offline blips */
    } finally {
      setLoading(false)
    }
  }, [roomId])

  React.useEffect(() => {
    setLoading(true)
    void load()
    const poll = window.setInterval(() => void load(), 10000)
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
      if (path === "stop" && isNativeApp()) {
        const mins = Math.max(1, Math.round(elapsed / 60000))

        void scheduleNativeNotification(undefined, {
          id: 12,
          title: "نشست مطالعه ثبت شد",
          body: `${mins} دقیقه به امروزت اضافه شد.`,
          delayMs: 1000,
        })
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

  // First start explains background truth + takes notification permission
  // (native) — once per device, remembered in localStorage.
  const requestStart = () => {
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

    if (isNativeApp()) {
      await scheduleNativeNotification(undefined, {
        id: 11,
        title: "تایمر مطالعه شروع شد",
        body: "می‌توانی برنامه را ببندی — زمانت روی سرور نگه داشته می‌شود.",
        delayMs: 1000,
      })
    }

    await act("start", { roomId })
  }

  const leave = async () => {
    if (!confirm("از اتاق خارج می‌شوی؟ تایمر فعال هم متوقف می‌شود.")) return

    try {
      await apiFetch(`/api/study/rooms/${roomId}/leave`, { method: "POST", body: JSON.stringify({}) })
      go({ name: "rooms" })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "خروج ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    }
  }

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
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronRight className="size-4 rtl:rotate-180" />
        بازگشت به لیست
      </button>

      <div className="text-center">
        <h1 className="text-xl font-bold">{detail.room.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          <FaNum>{detail.room.memberCount}</FaNum> نفر · <FaNum>{detail.room.studyingNow}</FaNum> نفر در حال مطالعه
        </p>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <span
          className={cn(
            "text-[11px] rounded-full px-3 py-1",
            detail.room.type === "COMPETITIVE" ? "bg-[#0878F9]/10 text-[#0878F9]" : "bg-success/10 text-success",
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
            className="inline-flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1 border border-dashed border-[#0878F9] text-[#0878F9] cursor-pointer"
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
        <p className="text-5xl font-extrabold tabular-nums tracking-wider" dir="ltr">
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
              className="h-12 px-8 cursor-pointer bg-gradient-to-l from-[#18A8FF] to-[#0878F9]"
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
              <Button onClick={() => void act("resume")} disabled={busy} className="h-12 px-8 cursor-pointer bg-gradient-to-l from-[#18A8FF] to-[#0878F9]">
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
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            زنده
          </span>
        </div>
        <ul className="space-y-2">
          {detail.leaderboard.map((r, i) => (
            <li
              key={r.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                r.isMe ? "border-[#0878F9] bg-[#0878F9]/5" : "border-border bg-card",
              )}
            >
              <span className={cn("text-sm font-bold w-5 text-center tabular-nums", i === 0 ? "text-[#0878F9]" : "text-muted-foreground")}>
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
              {r.status === "studying" && <span className="size-2 rounded-full bg-success animate-pulse" />}
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
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
            onClick={() => setCapacity((c) => Math.min(20, c + 1))}
            disabled={capacity >= 20}
            aria-label="افزایش ظرفیت"
            className="rounded-full cursor-pointer bg-gradient-to-l from-[#18A8FF] to-[#0878F9]"
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
            className="rounded-full cursor-pointer"
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
        className="w-full h-12 cursor-pointer bg-gradient-to-l from-[#18A8FF] to-[#0878F9]"
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
