
import * as React from "react"
import {
  Moon,
  Sun,
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
  Pencil,
  Check,
  Trash2,
} from "lucide-react"
import { useTheme } from "@/lib/theme-provider"
import type { Theme } from "@/lib/theme"
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
import { cn, ICON_STROKE } from "@/lib/utils";

export function SettingsView() {
  const user = useApp((s) => s.user)
  const signOut = useApp((s) => s.signOut)
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const [repeatQuestions, setRepeatQuestions] = React.useState(false)
  const [duration, setDuration] = React.useState(20)
  const [dailyGoal, setDailyGoal] = React.useState(20)
  const [studyGoal, setStudyGoal] = React.useState(180)
  const [saving, setSaving] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)

    if (!user) return

    const exam = parseExamPrefs(user.prefs)

    if (exam.repeatQuestions !== undefined) setRepeatQuestions(exam.repeatQuestions)

    if (exam.examDurationMin !== undefined) setDuration(exam.examDurationMin)

    if (exam.dailyGoal !== undefined) setDailyGoal(exam.dailyGoal)

    if (exam.studyGoalMin !== undefined) setStudyGoal(exam.studyGoalMin)
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
    value: Theme
    label: string
    icon: typeof Moon
  }> = [
    { value: "dark", label: "تاریک", icon: Moon },
    { value: "light", label: "روشن", icon: Sun },
  ]

  if (!user) return null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-balance">تنظیمات</h1>
        <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
          پروفایل، ترجیحات و تم نمایش.
        </p>
      </div>

      {/* Profile */}
      <ProfileCard />

      {/* Theme */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold">نمایش</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
                    background: opt.value === "dark" ? "#0A0A0A" : "#FAFAFA",
                  }}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      opt.value === "dark" ? "text-white" : "text-black",
                    )}
                    strokeWidth={ICON_STROKE}
                  />
                </div>
                <span className={cn("text-xs", active && "font-semibold")}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="flex items-center gap-3 p-4">
          <Repeat className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
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
          <Timer className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
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
          <Target className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
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
        <div className="flex items-center gap-3 p-4 border-t border-border">
          <Timer className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
          <div className="flex-1 min-w-0">
            <Label htmlFor="study-goal-select" className="text-sm font-medium cursor-pointer">
              هدف روزانه مطالعه
            </Label>
            <p className="text-[11px] text-muted-foreground">
              دقیقه در روز — در اتاق مطالعه نمایش داده می‌شود.
            </p>
          </div>
          <Select
            value={String(studyGoal)}
            onValueChange={(v) => {
              const n = Number(v)
              setStudyGoal(n)
              void savePrefs({ studyGoalMin: n })
            }}
          >
            <SelectTrigger id="study-goal-select" className="w-24 cursor-pointer" dir="ltr">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[60, 120, 180, 240, 300, 360, 480].map((m) => (
                <SelectItem key={m} value={String(m)} className="cursor-pointer">
                  <FaNum>{m}</FaNum> دقیقه
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
          <MessageSquare className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
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
      <Icon className="size-4 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="ms-auto text-sm font-medium" dir={dir}>
        {children}
      </span>
    </li>
  )
}

const AVATAR_MAX_BYTES = 500 * 1024

interface ProfileSaveBody {
  name?: string
  avatarBase64?: string | null
}

/**
 * Social-style profile card: tap the avatar to set/change the photo
 * (pencil badge), pencil button next to the name for inline rename.
 */
function ProfileCard() {
  const user = useApp((s) => s.user)
  const { toast } = useToast()
  const [editingName, setEditingName] = React.useState(false)
  const [name, setName] = React.useState(user?.name ?? "")
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setName(user?.name ?? "")
    setEditingName(false)
  }, [user?.id])

  if (!user) return null

  const saveBody = async (body: ProfileSaveBody) => {
    setSaving(true)

    try {
      const res = await apiFetch<{ user: { name: string; avatarBase64: string | null } }>(
        "/api/user/profile",
        { method: "PUT", body: JSON.stringify(body) },
      )

      useApp.getState().patchUser({ name: res.user.name, avatarBase64: res.user.avatarBase64 })
      toast({ title: "پروفایل به‌روزرسانی شد" })

      return true
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ذخیره پروفایل ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })

      return false
    } finally {
      setSaving(false)
    }
  }

  const saveName = async () => {
    const trimmed = name.trim()

    if (trimmed.length < 2 || trimmed === user.name) {
      setEditingName(false)
      setName(user.name)

      return
    }

    if (await saveBody({ name: trimmed })) setEditingName(false)
  }

  const pickFile = (file: File | undefined) => {
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "فایل معتبر نیست", description: "فقط تصویر انتخاب کنید." })

      return
    }

    if (file.size > AVATAR_MAX_BYTES) {
      toast({ variant: "destructive", title: "تصویر خیلی بزرگ است", description: "حداکثر ۵۰۰ کیلوبایت." })

      return
    }

    setUploading(true)

    const reader = new FileReader()

    reader.onload = () => {
      const url = String(reader.result ?? "")

      if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) {
        setUploading(false)
        toast({ variant: "destructive", title: "فرمت تصویر پشتیبانی نمی‌شود" })

        return
      }

      void saveBody({ avatarBase64: url }).finally(() => setUploading(false))
    }

    reader.onerror = () => {
      setUploading(false)
      toast({ variant: "destructive", title: "خواندن فایل ناموفق بود" })
    }

    reader.readAsDataURL(file)
  }

  const removeAvatar = () => {
    void saveBody({ avatarBase64: null })
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        {/* Tappable avatar with pencil badge */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="تغییر عکس پروفایل"
          className="relative flex size-12 items-center justify-center rounded-full bg-secondary text-base font-semibold overflow-visible shrink-0 cursor-pointer hover:ring-2 hover:ring-foreground/20 transition-shadow"
        >
          <span className="flex size-full items-center justify-center rounded-full overflow-hidden">
            {uploading || saving ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : user.avatarBase64 ? (
              <img src={user.avatarBase64} alt="پروفایل" className="size-full object-cover" />
            ) : (
              user.name.charAt(0)
            )}
          </span>
          <span className="absolute -bottom-0.5 -left-0.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow">
            <Pencil className="size-3" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="h-9"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName()

                  if (e.key === "Escape") {
                    setEditingName(false)
                    setName(user.name)
                  }
                }}
                aria-label="نام نمایشی"
              />
              <Button size="icon" onClick={() => void saveName()} disabled={saving} className="size-9 shrink-0 cursor-pointer" aria-label="ذخیره نام">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="font-semibold truncate">{user.name}</p>
              <button
                type="button"
                onClick={() => {
                  setName(user.name)
                  setEditingName(true)
                }}
                aria-label="ویرایش نام"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {user.field === "FANI_HERFEI" ? "شبکه" : "حسابداری"}
              {user.role === "ADMIN" && " — مدیر"}
            </p>
            {user.avatarBase64 && (
              <button
                type="button"
                onClick={removeAvatar}
                className="inline-flex items-center gap-1 min-h-[44px] text-[10px] text-destructive/80 hover:text-destructive cursor-pointer"
              >
                <Trash2 className="size-3" />
                حذف عکس
              </button>
            )}
          </div>
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
        <Lock className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
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
              className="h-10 text-left pl-9"
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
                className="h-10 text-left pl-9"
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
                "h-10 text-left",
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
