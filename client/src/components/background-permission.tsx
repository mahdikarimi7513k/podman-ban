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
import { isNativeApp, scheduleNativeNotification } from "@/lib/native-notify"
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
  const [open, setOpen] = React.useState(false)
  const [liveTimer, setLiveTimer] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!isNativeApp()) return

    let stored: string | null = null

    try {
      stored = window.localStorage.getItem(FLAG)
    } catch {
      return
    }

    if (stored === "1") return

    void apiFetch<{ session: { id: string } | null }>("/api/study/session/active")
      .then((r) => setLiveTimer(!!r.session))
      .catch(() => {})
      .finally(() => setOpen(true))
  }, [])

  const done = (granted: boolean) => {
    try {
      window.localStorage.setItem(FLAG, "1")
    } catch {
      /* ignore */
    }

    setOpen(false)

    if (granted) {
      setBusy(true)

      void scheduleNativeNotification(undefined, {
        id: 10,
        title: "اعلان مطالعه فعال شد",
        body: liveTimer
          ? "تایمرت در پس‌زمینه هم حساب می‌شود — با خیال راحت ادامه بده."
          : "از این به بعد شروع و پایان مطالعه را خبرت می‌کنم.",
        delayMs: 1000,
      }).finally(() => setBusy(false))
    }
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
          <p className="text-[12px]">
            نکته گوشی‌های اندرویدی: اگر گوشی اعلان را دیر نشان داد، در تنظیمات گوشی مسیر
            برنامه‌ها ← پودمان‌بان ← باتری را روی «بدون محدودیت» بگذار تا اندروید
            برنامه را در پس‌زمینه نبندد.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => done(false)} className="cursor-pointer">
            بعداً
          </Button>
          <Button onClick={() => done(true)} disabled={busy} className="cursor-pointer">
            {busy && <Loader2 className="size-4 animate-spin" />}
            فعال‌سازی
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
