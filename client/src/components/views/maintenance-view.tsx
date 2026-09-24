
import { Lock } from "lucide-react"
import { ICON_STROKE_LARGE } from "@/lib/utils";

export function MaintenanceView({ message }: { message?: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card mb-6">
        <Lock className="size-7 text-muted-foreground" strokeWidth={ICON_STROKE_LARGE} />
      </div>
      <h1 className="text-xl font-bold">سامانه موقتاً غیرفعال است</h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {message || "در حال به‌روزرسانی هستیم. به‌زودی باز می‌گردیم."}
      </p>
    </div>
  )
}
