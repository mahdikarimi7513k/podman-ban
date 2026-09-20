
import * as React from "react"
import {
  Moon,
  Sun,
  Monitor,
  Repeat,
  Timer,
  Target,
  LogOut,
  User,
  Hash,
  CalendarDays,
  Loader2,
  MessageSquare,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useApp } from "@/lib/store"
import { apiFetch, ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { FaNum } from "@/components/fa-utils"
import { parseExamPrefs } from "@/lib/exam-prefs"
import type { ExamPrefs } from "@/lib/exam-prefs"
import { ChatPanel } from "@/components/chat-panel"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function SettingsView() {
  const user = useApp((s) => s.user)
  const signOut = useApp((s) => s.signOut)
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const [repeatQuestions, setRepeatQuestions] = React.useState(false)
  const [duration, setDuration] = React.useState(20)
  const [dailyGoal, setDailyGoal] = React.useState(20)
  const [saving, setSaving] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)

    if (!user) return

    const exam = parseExamPrefs(user.prefs)

    if (exam.repeatQuestions !== undefined) setRepeatQuestions(exam.repeatQuestions)

    if (exam.examDurationMin !== undefined) setDuration(exam.examDurationMin)

    if (exam.dailyGoal !== undefined) setDailyGoal(exam.dailyGoal)
  }, [user])

  const savePrefs = React.useCallback(
    async (patch: ExamPrefs) => {
      setSaving(true)

      try {
        const res = await apiFetch<{ prefs: unknown }>("/api/user/prefs", {
          method: "PUT",
          body: JSON.stringify(patch),
        })
        // Refresh the local user immediately — otherwise home keeps reading
        // the stale prefs until the next boot/login (looked "not working").
        // patchUser (not setUser) so the view doesn't navigate away.

        const current = useApp.getState().user

        if (current) {
          useApp.getState().patchUser({ prefs: JSON.stringify(res.prefs) })
        }
      } catch {
        toast({
          variant: "destructive",
          title: "ذخیره تنظیمات ناموفق بود",
        })
      } finally {
        setSaving(false)
      }
    },
    [toast],
  )

  const themeOptions: Array<{
    value: string
    label: string
    icon: typeof Moon
  }> = [
    { value: "dark", label: "تاریک", icon: Moon },
    { value: "light", label: "روشن", icon: Sun },
    { value: "system", label: "خودکار", icon: Monitor },
  ]

  if (!user) return null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-balance">تنظیمات</h1>
        <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
          پروفایل، ترجیحات و تم نمایش.
        </p>
      </div>

      {/* Profile */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-base font-semibold">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground">
              {user.field === "FANI_HERFEI" ? "شبکه" : "حسابداری"}
              {user.role === "ADMIN" && " — مدیر"}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border text-sm">
          <ProfileRow icon={User} label="نام کاربری" dir="ltr">
            {user.username}
          </ProfileRow>
          <ProfileRow icon={Hash} label="کل آزمون‌های زده‌شده">
            <FaNum>{user.totalTests}</FaNum>
          </ProfileRow>
          {user.createdAt && (
            <ProfileRow icon={CalendarDays} label="تاریخ عضویت">
              {formatDate(user.createdAt)}
            </ProfileRow>
          )}
        </ul>
      </section>

      {/* Theme */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="size-4 text-muted-foreground" strokeWidth={2} />
          <h2 className="text-sm font-semibold">نمایش</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((opt) => {
            const active = mounted && theme === opt.value
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border py-3 transition-[color,background-color,border-color,box-shadow] duration-200 cursor-pointer",
                  active
                    ? "border-foreground bg-foreground/[0.06] text-foreground shadow-sm"
                    : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:border-foreground/20",
                )}
              >
                {/* mini theme preview swatch */}
                <div
                  className={cn(
                    "size-8 rounded-md border-2 flex items-center justify-center",
                    active ? "border-foreground" : "border-transparent",
                  )}
                  style={{
                    background:
                      opt.value === "dark"
                        ? "#0A0A0A"
                        : opt.value === "light"
                          ? "#FAFAFA"
                          : "linear-gradient(135deg, #FAFAFA 50%, #0A0A0A 50%)",
                  }}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      opt.value === "dark" ? "text-white" : opt.value === "light" ? "text-black" : "text-muted-foreground",
                    )}
                    strokeWidth={2}
                  />
                </div>
                <span className={cn("text-xs", active && "font-semibold")}>{opt.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          در حالت «خودکار»، تم بر اساس تنظیمات سیستم شما انتخاب می‌شود.
        </p>
      </section>

      {/* Preferences */}
      <section className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="flex items-center gap-3 p-4">
          <Repeat className="size-4 text-muted-foreground shrink-0" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <Label htmlFor="repeat-switch" className="text-sm font-medium cursor-pointer">
              حذف سوالات تکراری
            </Label>
            <p className="text-[11px] text-muted-foreground">
              اگر روشن باشد، سوالاتی که پیش‌تر پاسخ داده‌اید در آزمون نمی‌آیند.
            </p>
          </div>
          {/* Display-only inversion: the backend flag keeps its meaning
              (repeatQuestions=false = exclude answered). The switch shows
              the opposite (!repeatQuestions) so ON means "hide repeats".
              No migration needed — old false values now simply render ON,
              which already matches the new meaning. */}
          <Switch
            id="repeat-switch"
            checked={!repeatQuestions}
            onCheckedChange={(v) => {
              setRepeatQuestions(!v)
              void savePrefs({ repeatQuestions: !v })
            }}
          />
        </div>
        <div className="flex items-center gap-3 p-4">
          <Timer className="size-4 text-muted-foreground shrink-0" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <Label htmlFor="duration-select" className="text-sm font-medium cursor-pointer">
              زمان پیش‌فرض هر آزمون
            </Label>
            <p className="text-[11px] text-muted-foreground">
              به دقیقه — هنگام شروع آزمون اعمال می‌شود.
            </p>
          </div>
          <Select
            value={String(duration)}
            onValueChange={(v) => {
              const n = Number(v)
              setDuration(n)
              void savePrefs({ examDurationMin: n })
            }}
          >
            <SelectTrigger id="duration-select" className="w-24 cursor-pointer" dir="ltr">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 30, 45, 60].map((m) => (
                <SelectItem key={m} value={String(m)} className="cursor-pointer">
                  <FaNum>{m}</FaNum> دقیقه
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 p-4 border-t border-border">
          <Target className="size-4 text-muted-foreground shrink-0" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <Label htmlFor="goal-select" className="text-sm font-medium cursor-pointer">
              هدف روزانه
            </Label>
            <p className="text-[11px] text-muted-foreground">
              تعداد سوال در روز — در کارت هدف خانه نمایش داده می‌شود.
            </p>
          </div>
          <Select
            value={String(dailyGoal)}
            onValueChange={(v) => {
              const n = Number(v)
              setDailyGoal(n)
              void savePrefs({ dailyGoal: n })
            }}
          >
            <SelectTrigger id="goal-select" className="w-24 cursor-pointer" dir="ltr">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 30, 50, 100].map((m) => (
                <SelectItem key={m} value={String(m)} className="cursor-pointer">
                  <FaNum>{m}</FaNum> سوال
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Password change */}
      <PasswordChangeSection />

      {/* Online support */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" strokeWidth={2} />
          <h2 className="text-sm font-semibold">پشتیبانی آنلاین</h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          پیام بدهید، مدیریت پاسخ می‌دهد. گفتگو خصوصی و فقط بین شما و مدیریت است.
        </p>
        {user.id && (
          <ChatPanel userId={user.id} isAdmin={false} height="h-[45vh]" />
        )}
      </section>

      {/* Save indicator */}
      {saving && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          در حال ذخیره…
        </p>
      )}

      {/* Sign out */}
      <Button
        variant="outline"
        onClick={() => void signOut()}
        className="w-full h-11 cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
      >
        <LogOut className="size-4" />
        خروج از حساب
      </Button>
    </div>
  )
}

function ProfileRow({
  icon: Icon,
  label,
  children,
  dir,
}: {
  icon: typeof User
  label: string
  children: React.ReactNode
  dir?: "ltr" | "rtl"
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 text-muted-foreground shrink-0" strokeWidth={2} />
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="ms-auto text-sm font-medium" dir={dir}>
        {children}
      </span>
    </li>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso))
  } catch {
    return ""
  }
}

function PasswordChangeSection() {
  const { toast } = useToast()
  const setUser = useApp((s) => s.setUser)
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [showCurrent, setShowCurrent] = React.useState(false)
  const [showNew, setShowNew] = React.useState(false)

  const passwordsMatch = next === confirm
  const canSubmit =
    current.length >= 1 &&
    next.length >= 8 &&
    /[a-zA-Z]/.test(next) &&
    /\d/.test(next) &&
    passwordsMatch &&
    next !== current

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    try {
      await apiFetch("/api/user/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      // The server revoked every session and cleared the cookies — this device
      // is signed out whether we like it or not. Send the user to re-login
      // instead of leaving them on a dead-auth settings page.
      toast({ title: "رمز عبور تغییر کرد — دوباره وارد شوید" })
      setUser(null)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تغییر رمز ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="size-4 text-muted-foreground" strokeWidth={2} />
        <h2 className="text-sm font-semibold">تغییر رمز عبور</h2>
      </div>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="cur-pw" className="text-xs">رمز عبور فعلی</Label>
          <div className="relative">
            <Input
              id="cur-pw"
              type={showCurrent ? "text" : "password"}
              dir="ltr"
              className="h-10 text-right pl-9"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
              aria-label={showCurrent ? "پنهان کردن" : "نمایش"}
            >
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-pw" className="text-xs">رمز عبور جدید</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNew ? "text" : "password"}
                dir="ltr"
                className="h-10 text-right pl-9"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                placeholder="حداقل ۸ نویسه"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
                aria-label={showNew ? "پنهان کردن" : "نمایش"}
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw" className="text-xs">تکرار رمز جدید</Label>
            <Input
              id="confirm-pw"
              type={showNew ? "text" : "password"}
              dir="ltr"
              className={cn(
                "h-10 text-right",
                confirm.length > 0 && !passwordsMatch && "border-destructive",
              )}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="تکرار رمز جدید"
            />
          </div>
        </div>
        {confirm.length > 0 && !passwordsMatch && (
          <p className="text-xs text-destructive">رمز عبور و تکرار آن یکسان نیستند.</p>
        )}
        <Button
          type="submit"
          disabled={!canSubmit || saving}
          className="cursor-pointer"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          تغییر رمز
        </Button>
      </form>
    </section>
  )
}
