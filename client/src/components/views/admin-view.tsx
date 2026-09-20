
import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { expandCollapse, transitionBase } from "@/lib/motion"
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Archive,
  MessageSquare,
  Loader2,
  Power,
  AlertTriangle,
  Pencil,
  Megaphone,
  UserPlus,
  KeyRound,
  Copy,
  Check,
} from "lucide-react"
import { useApp } from "@/lib/store"
import { apiFetch, apiUpload, ApiError } from "@/lib/api-client"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { FaNum } from "@/components/fa-utils"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { AdminContent } from "@/components/views/admin-content"
import { ChatPanel } from "@/components/chat-panel"

interface Stats {
  usersCount: number
  studentsCount: number
  booksCount: number
  modulesCount: number
  questionsCount: number
  sessionsCount: number
  archiveCount: number
  unreadChats: number
}

interface AdminConfig {
  siteLocked: boolean
  lockMessage: string
  bannerText: string
  bannerLink: string
  bannerActive: boolean
  defaultTimerMin: number
  negativeMarking: boolean
  registrationOpen: boolean
  registrationMessage: string
  externalApiEnabled: boolean
  externalApiKeyPrefix: string
}

interface AppUserLite {
  id: string
  username: string
  name: string
  field: "FANI_HERFEI" | "KARDANESH"
  role: "STUDENT" | "ADMIN"
  totalTests: number
  createdAt: string
}

export function AdminView() {
  const [tab, setTab] = React.useState("dashboard")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">پنل مدیریت</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          مدیریت محتوا، کاربران، آرشیو و تنظیمات سامانه.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-6 h-auto">
          <TabsTrigger value="dashboard" className="cursor-pointer flex-col gap-1 py-2 text-[11px]">
            <LayoutDashboard className="size-4" strokeWidth={2} />
            <span className="hidden xs:inline">داشبورد</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="cursor-pointer flex-col gap-1 py-2 text-[11px]">
            <BookOpen className="size-4" strokeWidth={2} />
            <span className="hidden xs:inline">محتوا</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="cursor-pointer flex-col gap-1 py-2 text-[11px]">
            <Users className="size-4" strokeWidth={2} />
            <span className="hidden xs:inline">کاربران</span>
          </TabsTrigger>
          <TabsTrigger value="archive" className="cursor-pointer flex-col gap-1 py-2 text-[11px]">
            <Archive className="size-4" strokeWidth={2} />
            <span className="hidden xs:inline">آرشیو</span>
          </TabsTrigger>
          <TabsTrigger value="notify" className="cursor-pointer flex-col gap-1 py-2 text-[11px]">
            <Megaphone className="size-4" strokeWidth={2} />
            <span className="hidden xs:inline">اعلان‌ها</span>
          </TabsTrigger>
          <TabsTrigger value="support" className="cursor-pointer flex-col gap-1 py-2 text-[11px]">
            <MessageSquare className="size-4" strokeWidth={2} />
            <span className="hidden xs:inline">پشتیبانی</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 focus-visible:outline-none">
          <AdminDashboard />
        </TabsContent>
        <TabsContent value="content" className="mt-4 focus-visible:outline-none">
          <AdminContent />
        </TabsContent>
        <TabsContent value="users" className="mt-4 focus-visible:outline-none">
          <AdminUsers />
        </TabsContent>
        <TabsContent value="archive" className="mt-4 focus-visible:outline-none">
          <AdminArchive />
        </TabsContent>
        <TabsContent value="notify" className="mt-4 focus-visible:outline-none">
          <AdminNotify />
        </TabsContent>
        <TabsContent value="support" className="mt-4 focus-visible:outline-none">
          <AdminSupport />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------- Dashboard ----------------

function AdminDashboard() {
  const { toast } = useToast()
  const refreshConfig = useApp((s) => s.refreshConfig)
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [config, setConfig] = React.useState<AdminConfig | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [savingLock, setSavingLock] = React.useState(false)
  const [savingReg, setSavingReg] = React.useState(false)
  const [newKey, setNewKey] = React.useState<string | null>(null)
  const [extBusy, setExtBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([
        apiFetch<{ stats: Stats }>("/api/admin/stats"),
        apiFetch<{ state: AdminConfig }>("/api/admin/config"),
      ])
      setStats(s.stats)
      setConfig(c.state)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const toggleLock = async (locked: boolean) => {
    setSavingLock(true)
    try {
      const res = await apiFetch<{ state: AdminConfig }>(
        "/api/admin/config",
        {
          method: "PUT",
          body: JSON.stringify({ siteLocked: locked }),
        },
      )
      setConfig(res.state)
      void refreshConfig()
      toast({
        title: locked ? "سایت قفل شد" : "سایت باز شد",
        description: locked ? "کاربران عادی صفحه‌ی قفل را می‌بینند." : undefined,
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تغییر وضعیت ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSavingLock(false)
    }
  }

  const toggleRegistration = async (open: boolean) => {
    setSavingReg(true)
    try {
      const res = await apiFetch<{ state: AdminConfig }>(
        "/api/admin/config",
        {
          method: "PUT",
          body: JSON.stringify({ registrationOpen: open }),
        },
      )
      setConfig(res.state)
      void refreshConfig()
      toast({
        title: open ? "ثبت‌نام باز شد" : "ثبت‌نام بسته شد",
        description: open
          ? "کاربران جدید می‌توانند ثبت‌نام کنند."
          : "کاربران جدید نمی‌توانند ثبت‌نام کنند (ساخت دستی همچنان فعال است).",
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تغییر وضعیت ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSavingReg(false)
    }
  }

  const issueKey = async () => {
    if (!confirm("کلید قبلی (اگر وجود داشته) باطل می‌شود. ادامه می‌دهید؟")) return
    setExtBusy(true)
    try {
      const res = await apiFetch<{ apiKey: string; prefix: string }>(
        "/api/admin/external-api/key",
        { method: "POST" },
      )
      setNewKey(res.apiKey)
      setCopied(false)
      const c = await apiFetch<{ state: AdminConfig }>("/api/admin/config")
      setConfig(c.state)
      void refreshConfig()
      toast({ title: "کلید جدید ساخته شد", description: "کلید را فقط یک بار می‌بینید — کپی کنید." })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ساخت کلید ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setExtBusy(false)
    }
  }

  const revokeKey = async () => {
    if (!confirm("کلید API خارجی باطل شود؟ سرویس خارجی دیگر تأیید نمی‌گیرد.")) return
    setExtBusy(true)
    try {
      await apiFetch("/api/admin/external-api/key", { method: "DELETE" })
      setNewKey(null)
      const c = await apiFetch<{ state: AdminConfig }>("/api/admin/config")
      setConfig(c.state)
      void refreshConfig()
      toast({ title: "کلید باطل شد" })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ابطال ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setExtBusy(false)
    }
  }

  if (loading || !stats || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="کاربران" value={stats.usersCount} />
        <Stat label="هنرجویان" value={stats.studentsCount} />
        <Stat label="کتاب‌ها" value={stats.booksCount} />
        <Stat label="پودمان‌ها" value={stats.modulesCount} />
        <Stat label="سوالات" value={stats.questionsCount} />
        <Stat label="آزمون‌های زده‌شده" value={stats.sessionsCount} />
        <Stat label="فایل‌های آرشیو" value={stats.archiveCount} />
        <Stat label="پیام‌های خوانده‌نشده" value={stats.unreadChats} />
      </div>

      {/* site lock */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              config.siteLocked
                ? "bg-destructive/10 text-destructive"
                : "bg-success/10 text-success",
            )}
          >
            <Power className="size-5" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <Label htmlFor="lock-switch" className="text-sm font-semibold cursor-pointer">
              قفل کامل سایت
            </Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {config.siteLocked
                ? "سایت قفل است — کاربران عادی پیام قفل را می‌بینند."
                : "سایت باز است — کاربران عادی می‌توانند وارد شوند."}
            </p>
          </div>
          <Switch
            id="lock-switch"
            checked={config.siteLocked}
            disabled={savingLock}
            onCheckedChange={toggleLock}
          />
        </div>

        <AnimatePresence>
          {config.siteLocked && (
            <motion.div
              variants={expandCollapse}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={transitionBase}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="lock-msg" className="text-xs flex items-center gap-1">
                  <AlertTriangle className="size-3.5" />
                  پیام نمایش‌داده‌شده هنگام قفل
                </Label>
                <Textarea
                  id="lock-msg"
                  value={config.lockMessage}
                  onChange={(e) =>
                    setConfig((c) => (c ? { ...c, lockMessage: e.target.value } : c))
                  }
                  rows={2}
                  placeholder="مثلاً: در حال به‌روزرسانی هستیم."
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={async () => {
                    try {
                      const res = await apiFetch<{ state: AdminConfig }>(
                        "/api/admin/config",
                        {
                          method: "PUT",
                          body: JSON.stringify({ lockMessage: config.lockMessage }),
                        },
                      )
                      setConfig(res.state)
                      toast({ title: "پیام ذخیره شد" })
                    } catch {
                      toast({ variant: "destructive", title: "ذخیره ناموفق بود" })
                    }
                  }}
                >
                  ذخیره پیام
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* registration gate */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              config.registrationOpen
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <UserPlus className="size-5" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <Label htmlFor="reg-switch" className="text-sm font-semibold cursor-pointer">
              ثبت‌نام کاربران جدید
            </Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {config.registrationOpen
                ? "ثبت‌نام باز است — کاربران جدید می‌توانند حساب بسازند."
                : "ثبت‌نام بسته است — فرم ثبت‌نام مخفی است و سرور خطا می‌دهد."}
            </p>
          </div>
          <Switch
            id="reg-switch"
            checked={config.registrationOpen}
            disabled={savingReg}
            onCheckedChange={toggleRegistration}
          />
        </div>

        <AnimatePresence>
          {!config.registrationOpen && (
            <motion.div
              variants={expandCollapse}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={transitionBase}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="reg-msg" className="text-xs flex items-center gap-1">
                  <AlertTriangle className="size-3.5" />
                  متنی که کاربر به‌جای فرم ثبت‌نام می‌بیند (خالی = متن پیش‌فرض)
                </Label>
                <Textarea
                  id="reg-msg"
                  value={config.registrationMessage}
                  onChange={(e) =>
                    setConfig((c) => (c ? { ...c, registrationMessage: e.target.value } : c))
                  }
                  rows={2}
                  placeholder="مثلاً: ثبت‌نام ترم جدید از اول مهر باز می‌شود."
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={async () => {
                    try {
                      const res = await apiFetch<{ state: AdminConfig }>(
                        "/api/admin/config",
                        {
                          method: "PUT",
                          body: JSON.stringify({ registrationMessage: config.registrationMessage }),
                        },
                      )
                      setConfig(res.state)
                      void refreshConfig()
                      toast({ title: "پیام ذخیره شد" })
                    } catch {
                      toast({ variant: "destructive", title: "ذخیره ناموفق بود" })
                    }
                  }}
                >
                  ذخیره پیام
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* external verify API */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <KeyRound className="size-5" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">تأیید لاگین سرویس خارجی</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {config.externalApiEnabled
                ? `فعال است${config.externalApiKeyPrefix ? ` — ${config.externalApiKeyPrefix}` : ""}`
                : "غیرفعال است."}{" "}
              سرویس خارجی با کلید + یوزرنیم/پسورد به <span dir="ltr" className="font-mono text-[10px]">POST /api/external/verify</span> جواب JSON می‌گیرد.
            </p>
          </div>
        </div>
        {newKey && (
          <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="text-xs font-semibold">کلید جدید — فقط یک بار نمایش داده می‌شود:</p>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 min-w-0 truncate rounded bg-background px-2 py-1.5 font-mono text-[11px] text-left">
                {newKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer shrink-0"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(newKey)
                    setCopied(true)
                    toast({ title: "کپی شد" })
                  } catch {
                    toast({ variant: "destructive", title: "کپی ناموفق بود" })
                  }
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "کپی شد" : "کپی"}
              </Button>
            </div>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="cursor-pointer" disabled={extBusy} onClick={issueKey}>
            {extBusy && <Loader2 className="size-4 animate-spin" />}
            {config.externalApiEnabled ? "صدور کلید جدید (ابطال قبلی)" : "صدور کلید"}
          </Button>
          {config.externalApiEnabled && (
            <Button size="sm" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive" disabled={extBusy} onClick={revokeKey}>
              ابطال کلید
            </Button>
          )}
        </div>
      </section>

      {/* Banner management */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Megaphone className="size-5" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <Label htmlFor="banner-switch" className="text-sm font-semibold cursor-pointer">
              بنر اعلان سراسری
            </Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {config.bannerActive
                ? "بنر فعال است — در بالای صفحه‌ی خانه نمایش داده می‌شود."
                : "بنر غیرفعال است."}
            </p>
          </div>
          <Switch
            id="banner-switch"
            checked={config.bannerActive}
            disabled={savingLock}
            onCheckedChange={async (v) => {
              try {
                const res = await apiFetch<{ state: AdminConfig }>(
                  "/api/admin/config",
                  { method: "PUT", body: JSON.stringify({ bannerActive: v }) },
                )
                setConfig(res.state)
                useApp.getState().refreshConfig()
                toast({ title: v ? "بنر فعال شد" : "بنر غیرفعال شد" })
              } catch (err) {
                toast({ variant: "destructive", title: "تغییر ناموفق بود", description: err instanceof ApiError ? err.message : undefined })
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="banner-text" className="text-xs">متن بنر</Label>
          <Textarea
            id="banner-text"
            value={config.bannerText}
            onChange={(e) =>
              setConfig((c) => (c ? { ...c, bannerText: e.target.value } : c))
            }
            rows={2}
            placeholder="مثلاً: آزمون آزمایشی فعال شد — موفق باشید!"
          />
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={async () => {
              try {
                const res = await apiFetch<{ state: AdminConfig }>(
                  "/api/admin/config",
                  { method: "PUT", body: JSON.stringify({ bannerText: config.bannerText }) },
                )
                setConfig(res.state)
                useApp.getState().refreshConfig()
                toast({ title: "بنر ذخیره شد" })
              } catch (err) {
                toast({ variant: "destructive", title: "ذخیره ناموفق بود", description: err instanceof ApiError ? err.message : undefined })
              }
            }}
          >
            ذخیره بنر
          </Button>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xl font-bold tabular-nums">
        <FaNum>{value}</FaNum>
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{label}</p>
    </div>
  )
}

// ---------------- Users ----------------

function AdminUsers() {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const [users, setUsers] = React.useState<AppUserLite[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [editing, setEditing] = React.useState<AppUserLite | null>(null)
  // create-user form
  const [cName, setCName] = React.useState("")
  const [cUsername, setCUsername] = React.useState("")
  const [cPassword, setCPassword] = React.useState("")
  const [cField, setCField] = React.useState<"FANI_HERFEI" | "KARDANESH">("FANI_HERFEI")
  const [creating, setCreating] = React.useState(false)

  const createUser = async () => {
    const username = cUsername.trim().toLowerCase().replace(/\s+/g, "")
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      toast({ variant: "destructive", title: "نام کاربری معتبر نیست", description: "۳ تا ۳۲ نویسه (انگلیسی، عدد، _ یا نقطه)" })
      return
    }
    if (cName.trim().length < 2) {
      toast({ variant: "destructive", title: "نام معتبر نیست", description: "نام حداقل ۲ نویسه باشد" })
      return
    }
    if (cPassword.length < 8 || !(/[a-zA-Z]/.test(cPassword) && /\d/.test(cPassword))) {
      toast({ variant: "destructive", title: "رمز معتبر نیست", description: "حداقل ۸ نویسه شامل حرف و عدد" })
      return
    }
    setCreating(true)
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name: cName.trim(), username, password: cPassword, field: cField }),
      })
      setCName("")
      setCUsername("")
      setCPassword("")
      await load()
      toast({ title: "کاربر ساخته شد", description: `«${username}» حالا می‌تواند وارد شود.` })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ساخت کاربر ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setCreating(false)
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ users: AppUserLite[] }>("/api/admin/users")
      setUsers(res.users)
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const remove = async (id: string, name: string) => {
    if (!confirm(`حذف کاربر «${name}»؟ این عمل قابل بازگشت نیست.`)) return
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" })
      await load()
      toast({ title: "کاربر حذف شد" })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "حذف ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    }
  }

  const filtered = users?.filter(
    (u) =>
      u.name.includes(search) ||
      u.username.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4" strokeWidth={2} />
          <h3 className="text-sm font-semibold">ساخت کاربر جدید</h3>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          نام کاربری و رمزی که اینجا می‌سازید، کاربر عادی با همان‌ها وارد می‌شود — حتی اگر ثبت‌نام عمومی بسته باشد.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="نام و نام خانوادگی"
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            className="h-10"
            autoComplete="off"
          />
          <Input
            placeholder="username"
            value={cUsername}
            onChange={(e) => setCUsername(e.target.value.toLowerCase())}
            className="h-10 text-left"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
          />
          <Input
            placeholder="رمز عبور (حداقل ۸ نویسه شامل حرف و عدد)"
            type="password"
            value={cPassword}
            onChange={(e) => setCPassword(e.target.value)}
            className="h-10 text-left"
            dir="ltr"
            autoComplete="new-password"
          />
          <Select value={cField} onValueChange={(v) => setCField(v as "FANI_HERFEI" | "KARDANESH")}>
            <SelectTrigger className="h-10 cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FANI_HERFEI" className="cursor-pointer">شبکه</SelectItem>
              <SelectItem value="KARDANESH" className="cursor-pointer">حسابداری</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={createUser} disabled={creating} className="cursor-pointer w-full sm:w-auto">
          {creating && <Loader2 className="size-4 animate-spin" />}
          ساخت کاربر
        </Button>
      </section>
      <Input
        placeholder="جستجو بر اساس نام یا نام کاربری…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-10"
      />
      {!filtered || filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          کاربری یافت نشد.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold shrink-0">
                {u.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.name}</p>
                <p className="text-[11px] text-muted-foreground truncate" dir="ltr">
                  {u.username}
                </p>
              </div>
              <div className="text-left shrink-0">
                <p className="text-[11px] text-muted-foreground">
                  {u.role === "ADMIN" ? "مدیر" : u.field === "FANI_HERFEI" ? "شبکه" : "حسابداری"}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  <FaNum>{u.totalTests}</FaNum> آزمون
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(u)}
                aria-label="ویرایش کاربر"
                className="size-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
              >
                <Pencil className="size-4" />
              </button>
              {u.id !== user?.id && (
                <button
                  type="button"
                  onClick={() => remove(u.id, u.name)}
                  aria-label="حذف کاربر"
                  className="size-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                >
                  <Power className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <UserEditDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function UserEditDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AppUserLite
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = React.useState(user.name)
  const [field, setField] = React.useState<"FANI_HERFEI" | "KARDANESH">(user.field)
  const [role, setRole] = React.useState<"STUDENT" | "ADMIN">(user.role)
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), field, role }),
      })
      toast({ title: "کاربر به‌روزرسانی شد" })
      onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ذخیره ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ویرایش کاربر</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-username">نام کاربری</Label>
            <Input id="user-username" value={user.username} disabled dir="ltr" className="text-left" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-name">نام نمایشی</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="نام و نام خانوادگی"
            />
          </div>
          <div className="space-y-1.5">
            <Label>رشته</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["FANI_HERFEI", "KARDANESH"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setField(f)}
                  className={cn(
                    "min-h-[44px] rounded-md border text-sm font-medium transition-colors cursor-pointer",
                    field === f
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {f === "FANI_HERFEI" ? "شبکه" : "حسابداری"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>نقش</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["STUDENT", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "min-h-[44px] rounded-md border text-sm font-medium transition-colors cursor-pointer",
                    role === r
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {r === "ADMIN" ? "مدیر" : "هنرجو"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            انصراف
          </Button>
          <Button onClick={save} disabled={saving || name.trim().length < 2} className="cursor-pointer">
            {saving && <Loader2 className="size-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- Archive ----------------

const ARCHIVE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.zip"
const ARCHIVE_MAX_BYTES = 25 * 1024 * 1024

function AdminArchive() {
  const { toast } = useToast()
  const [files, setFiles] = React.useState<
    Array<{
      id: string
      title: string
      field: "FANI_HERFEI" | "KARDANESH"
      year: number
      month: number | null
      fileUrl: string | null
      answerUrl: string | null
      questionPath: string | null
      answerPath: string | null
    }>
  | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [mode, setMode] = React.useState<"link" | "upload">("upload")
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    title: "",
    field: "FANI_HERFEI" as "FANI_HERFEI" | "KARDANESH",
    year: 1403,
    month: "" as number | "",
    fileUrl: "",
    answerUrl: "",
  })
  const [questionFile, setQuestionFile] = React.useState<File | null>(null)
  const [answerFile, setAnswerFile] = React.useState<File | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ files: typeof files }>("/api/admin/archive")
      setFiles(res.files)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setForm({ title: "", field: "FANI_HERFEI", year: 1403, month: "", fileUrl: "", answerUrl: "" })
    setQuestionFile(null)
    setAnswerFile(null)
  }

  const pickFile = (file: File | undefined, setter: (f: File | null) => void): boolean => {
    if (!file) return false
    if (file.size > ARCHIVE_MAX_BYTES) {
      toast({ variant: "destructive", title: "حجم فایل بیش از حد مجاز است", description: "حداکثر ۲۵ مگابایت" })
      return false
    }
    setter(file)
    return true
  }

  const add = async () => {
    if (!form.title.trim()) return
    if (mode === "link" && !form.fileUrl.trim()) return
    if (mode === "upload" && !questionFile && !answerFile) {
      toast({
        variant: "destructive",
        title: "فایلی انتخاب نشده",
        description: "فایل سوالات یا پاسخنامه را انتخاب کنید یا به حالت لینک بروید.",
      })
      return
    }
    setSaving(true)
    try {
      const created = await apiFetch<{ file: { id: string } }>("/api/admin/archive", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          field: form.field,
          year: form.year,
          month: form.month === "" ? null : form.month,
          fileUrl:
            mode === "link"
              ? form.fileUrl.trim()
              : null,
          answerUrl: mode === "link" ? form.answerUrl.trim() || null : null,
          uploadQuestion: mode === "upload",
        }),
      })
      if (mode === "upload") {
        if (questionFile) {
          await apiUpload(`/api/admin/archive/${created.file.id}/file/question`, questionFile)
        }
        if (answerFile) {
          await apiUpload(`/api/admin/archive/${created.file.id}/file/answer`, answerFile)
        }
      }
      resetForm()
      await load()
      toast({ title: "فایل آرشیو افزوده شد" })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "افزودن ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm("حذف این فایل آرشیو؟")) return
    try {
      await apiFetch(`/api/admin/archive/${id}`, { method: "DELETE" })
      await load()
    } catch {
      toast({ variant: "destructive", title: "حذف ناموفق بود" })
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">افزودن فایل آرشیو (قلمچی/موسسات)</h3>

        {/* source mode switch */}
        <div
          role="tablist"
          aria-label="روش ارائه فایل"
          className="inline-flex rounded-lg border border-border p-0.5 gap-0.5 bg-secondary"
        >
          {(
            [
              ["upload", "آپلود فایل"],
              ["link", "لینک دانلود"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer " +
                (mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="عنوان"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="h-10 sm:col-span-2"
          />
          <Select value={form.field} onValueChange={(v) => setForm((f) => ({ ...f, field: v as "FANI_HERFEI" | "KARDANESH" }))}>
            <SelectTrigger className="h-10 cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FANI_HERFEI" className="cursor-pointer">شبکه</SelectItem>
              <SelectItem value="KARDANESH" className="cursor-pointer">حسابداری</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="سال (مثلاً ۱۴۰۳)"
            value={String(form.year)}
            onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) || 1403 }))}
            className="h-10"
          />

          {mode === "link" ? (
            <>
              <Input
                placeholder="لینک فایل سوالات (https://…)"
                value={form.fileUrl}
                onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
                className="h-10"
                dir="ltr"
              />
              <Input
                placeholder="لینک پاسخنامه (اختیاری)"
                value={form.answerUrl}
                onChange={(e) => setForm((f) => ({ ...f, answerUrl: e.target.value }))}
                className="h-10"
                dir="ltr"
              />
            </>
          ) : (
            <>
              <label className="block sm:col-span-2">
                <span className="text-xs text-muted-foreground mb-1 block">
                  فایل سوالات {questionFile ? `— ${questionFile.name}` : "(pdf، تصویر یا zip — حداکثر ۲۵MB)"}
                </span>
                <input
                  type="file"
                  accept={ARCHIVE_ACCEPT}
                  onChange={(e) => pickFile(e.target.files?.[0], setQuestionFile)}
                  className="w-full h-10 rounded-md border border-input bg-transparent px-2 text-xs cursor-pointer file:mr-2 file:border-0 file:bg-secondary file:text-foreground file:text-xs file:px-2 file:py-1.5 file:rounded file:cursor-pointer"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-muted-foreground mb-1 block">
                  فایل پاسخنامه (اختیاری) {answerFile ? `— ${answerFile.name}` : ""}
                </span>
                <input
                  type="file"
                  accept={ARCHIVE_ACCEPT}
                  onChange={(e) => pickFile(e.target.files?.[0], setAnswerFile)}
                  className="w-full h-10 rounded-md border border-input bg-transparent px-2 text-xs cursor-pointer file:mr-2 file:border-0 file:bg-secondary file:text-foreground file:text-xs file:px-2 file:py-1.5 file:rounded file:cursor-pointer"
                />
              </label>
            </>
          )}
        </div>
        <Button onClick={add} disabled={saving} className="cursor-pointer w-full sm:w-auto">
          {saving && <Loader2 className="size-4 animate-spin" />}
          افزودن به آرشیو
        </Button>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !files || files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          موردی در آرشیو نیست.
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.title}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  {f.field === null ? "مشترک" : f.field === "FANI_HERFEI" ? "شبکه" : "حسابداری"} — {f.year}
                  {f.month ? `/${f.month}` : ""}
                </p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {(f.questionPath || f.fileUrl) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      سوالات: {f.questionPath ? "آپلودی" : "لینک"}
                    </span>
                  )}
                  {(f.answerPath || f.answerUrl) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      پاسخنامه: {f.answerPath ? "آپلودی" : "لینک"}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                aria-label="حذف"
                className="size-8 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
              >
                <Archive className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- Support chat ----------------

// ---------------- Broadcast notifications ----------------

interface Broadcast {
  id: string
  title: string
  body: string
  active: boolean
  createdAt: string
}

function AdminNotify() {
  const { toast } = useToast()
  const [items, setItems] = React.useState<Broadcast[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)

    try {
      const res = await apiFetch<{ notifications: Broadcast[] }>("/api/admin/notifications")
      setItems(res.notifications)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function send() {
    if (!title.trim() || !body.trim() || sending) return
    setSending(true)

    try {
      await apiFetch("/api/admin/notifications", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      })
      setTitle("")
      setBody("")
      toast({ title: "ارسال شد", description: "اعلان در ورود بعدی کاربران نمایش داده می‌شود." })
      await load(true)
    } catch (e) {
      toast({
        title: "خطا",
        description: e instanceof ApiError ? e.message : "ارسال اعلان ناموفق بود",
      })
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    if (deletingId) return
    setDeletingId(id)

    try {
      await apiFetch(`/api/admin/notifications/${id}`, { method: "DELETE" })
      setItems((prev) => (prev ? prev.filter((n) => n.id !== id) : prev))
    } catch (e) {
      toast({
        title: "خطا",
        description: e instanceof ApiError ? e.message : "حذف اعلان ناموفق بود",
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5" strokeWidth={2} />
          <h2 className="text-sm font-semibold">ارسال اعلان به کاربران</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          در ورود بعدی، همه کاربران (وب و برنامه اندروید) این پیام را می‌بینند.
        </p>
        <div className="space-y-2">
          <Label htmlFor="notif-title">عنوان</Label>
          <Input
            id="notif-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: آزمون فردا"
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notif-body">متن پیام</Label>
          <Textarea
            id="notif-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="متن اعلان…"
            rows={3}
            maxLength={500}
          />
        </div>
        <Button
          type="button"
          onClick={() => void send()}
          disabled={sending || !title.trim() || !body.trim()}
          className="cursor-pointer"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : "ارسال اعلان"}
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">اعلان‌های اخیر</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !items || items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            هنوز اعلانی ارسال نشده است.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(n.id)}
                  disabled={deletingId === n.id}
                  className="cursor-pointer text-destructive hover:text-destructive shrink-0"
                >
                  {deletingId === n.id ? <Loader2 className="size-4 animate-spin" /> : "حذف"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AdminSupport() {
  const [conversations, setConversations] = React.useState<
    Array<{
      id: string
      username: string
      name: string
      field: "FANI_HERFEI" | "KARDANESH"
      unread: number
      lastMessage: { id: string; text: string; sender: string; createdAt: string } | null
    }>
  | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<string | null>(null)

  const load = React.useCallback(async (quiet = false) => {
    // Background refreshes stay silent: flipping `loading` every 15s flashes
    // a full-view spinner and drops the list scroll position.
    if (!quiet) setLoading(true)
    try {
      const res = await apiFetch<{ conversations: NonNullable<typeof conversations> }>(
        "/api/support/conversations",
      )
      setConversations(res.conversations)
    } catch {
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
    // poll for unread updates every 15s (silent — no spinner, no scroll jump)
    const id = setInterval(() => load(true), 15000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (selected) {
    const conv = conversations?.find((c) => c.id === selected)
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setSelected(null)
            void load()
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          بازگشت به لیست
        </button>
        {conv && (
          <div className="mb-1">
            <p className="text-sm font-semibold">{conv.name}</p>
            <p className="text-[11px] text-muted-foreground" dir="ltr">@{conv.username}</p>
          </div>
        )}
        <ChatPanel userId={selected} isAdmin />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        گفتگوهای پشتیبانی با کاربران.
      </p>
      {!conversations || conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          هنوز گفتگویی وجود ندارد.
        </div>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected(c.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-right hover:bg-accent/40 transition-colors cursor-pointer"
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {c.lastMessage ? c.lastMessage.text : "بدون پیام"}
                  </p>
                </div>
                {c.unread > 0 && (
                  <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive text-white text-[10px] px-1.5 tabular-nums shrink-0">
                    <FaNum>{c.unread}</FaNum>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
