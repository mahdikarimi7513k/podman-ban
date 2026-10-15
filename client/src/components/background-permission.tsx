/**
 * Background permission prompt (native APK only).
 *
 * On app entry we explain — once per device — that the study timer keeps
 * running on the server clock even outside the app, and take the system
 * notification permission so start/stop pings can reach the user while
 * the timer runs in the background.
 */
import * as React from "react"
import { BellRing, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { isNativeApp, ensureNotificationPermission } from "@/lib/native-notify"
import { parseExamPrefs } from "@/lib/exam-prefs"
import { useApp } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const FLAG = "study:bg-entry-asked"

export function BackgroundPermissionPrompt() {
  const prefs = useApp((s) => s.user?.prefs)
  const [open, setOpen] = React.useState(false)
  const [liveTimer, setLiveTimer] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [denied, setDenied] = React.useState(false)

  React.useEffect(() => {
    if (!isNativeApp()) return

    // Once ever: device flag OR synced server flag (reinstall-proof).
    let stored: string | null = null

    try {
      stored = window.localStorage.getItem(FLAG)
    } catch {
      return
    }

    if (stored === "1" || parseExamPrefs(prefs).bgPromptSeen === true) return

    void apiFetch<{ session: { id: string } | null }>("/api/study/session/active")
      .then((r) => setLiveTimer(!!r.session))
      .catch(() => {})
      .finally(() => setOpen(true))
  }, [prefs])

  const done = (granted: boolean) => {
    if (!granted) {
      markAsked()
      setOpen(false)

      return
    }

    setBusy(true)

    void ensureNotificationPermission().then((status) => {
      setBusy(false)

      if (status !== "granted") {
        // Blocked at OS level: the only way back is manual. Keep the
        // dialog open on the guidance instead of failing silently.
        markAsked()
        setDenied(true)

        return
      }

      markAsked()
      setOpen(false)
      setDenied(false)

      void scheduleActivePing()
    })
  }

  const markAsked = () => {
    try {
      window.localStorage.setItem(FLAG, "1")
    } catch {
      /* ignore */
    }

    // Sync the one-ever flag so other devices/reinstalls never re-ask.
    // Best-effort: a failure here still keeps the local flag above.
    void apiFetch("/api/user/prefs", {
      method: "PUT",
      body: JSON.stringify({ bgPromptSeen: true }),
    }).catch(() => {})

    // Refresh local user so the synced flag is visible immediately.
    void apiFetch<{ user: { prefs: string } }>("/api/auth/me")
      .then((r) => useApp.getState().patchUser({ prefs: r.user.prefs }))
      .catch(() => {})
  }

  const scheduleActivePing = async () => {
    const { scheduleNativeNotification } = await import("@/lib/native-notify")

    await scheduleNativeNotification(undefined, {
      id: 10,
      title: "اعلان مطالعه فعال شد",
      body: liveTimer
        ? "تایمرت در پس‌زمینه هم حساب می‌شود — با خیال راحت ادامه بده."
        : "از این به بعد شروع و پایان مطالعه را خبرت می‌کنم.",
      delayMs: 1000,
    })
  }

  if (!open) return null

  return (
    <Dialog open onOpenChange={(o) => !o && done(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="size-5" />
            مطالعه در پس‌زمینه
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2 text-sm leading-7 text-muted-foreground">
          <p>
            تایمر مطالعه روی <span className="text-foreground font-medium">ساعت سرور</span> کار می‌کند —
            حتی اگر برنامه را ببندی، زمانت گم نمی‌شود.
          </p>
          {liveTimer && (
            <p className="text-foreground font-medium">
              الان یک تایمر روشن داری — با فعال‌سازی اعلان، پایانش را هم خبرت می‌کنم.
            </p>
          )}
          <p>برای این خبررسانی، اجازه اعلان لازم است.</p>
          {denied ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] leading-6">
              اعلان‌ها در تنظیمات گوشی بسته است. برای فعال‌سازی دستی:
              <br />
              تنظیمات گوشی ← برنامه‌ها ← پودمان‌بان ← اعلان‌ها را روشن کن.
              <br />
              و برای باتری: برنامه‌ها ← پودمان‌بان ← باتری ← «بدون محدودیت».
            </div>
          ) : (
            <p className="text-[12px]">
              نکته گوشی‌های اندرویدی: اگر گوشی اعلان را دیر نشان داد، در تنظیمات گوشی مسیر
              برنامه‌ها ← پودمان‌بان ← باتری را روی «بدون محدودیت» بگذار تا اندروید
              برنامه را در پس‌زمینه نبندد.
            </p>
          )}
        </div>
        <DialogFooter>
          {denied ? (
            <Button onClick={() => setOpen(false)} className="cursor-pointer">
              فهمیدم
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => done(false)} className="cursor-pointer">
                بعداً
              </Button>
              <Button onClick={() => done(true)} disabled={busy} className="cursor-pointer">
                {busy && <Loader2 className="size-4 animate-spin" />}
                فعال‌سازی
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
