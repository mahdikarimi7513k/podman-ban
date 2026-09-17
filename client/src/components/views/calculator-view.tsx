
import * as React from "react"
import { Calculator, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { FaNum, ToPersianDigits, ToLatinDigits } from "@/components/fa-utils"
import { cn } from "@/lib/utils"

export function CalculatorView() {
  const [total, setTotal] = React.useState("20")
  const [correct, setCorrect] = React.useState("15")
  const [wrong, setWrong] = React.useState("3")
  const [neg, setNeg] = React.useState(true)

  const t = Math.max(0, parseInt(total) || 0)
  const c = Math.max(0, parseInt(correct) || 0)
  const w = Math.max(0, parseInt(wrong) || 0)
  const skipped = Math.max(0, t - c - w)

  const pctNoNeg = t > 0 ? Math.round((c / t) * 100) : 0
  const pctNeg =
    t > 0
      ? Math.max(0, Math.min(100, Math.round(((c * 3 - w) / (t * 3)) * 100)))
      : 0

  const finalPct = neg ? pctNeg : pctNoNeg
  const verdict =
    finalPct >= 50 ? "success" : finalPct >= 25 ? "warning" : "error"
  const verdictColor =
    verdict === "success"
      ? "text-success"
      : verdict === "warning"
        ? "text-warning"
        : "text-destructive"
  const verdictText =
    verdict === "success"
      ? "قبول"
      : verdict === "warning"
        ? "مرزی"
        : "مردود"

  const invalid = c + w > t

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">ابزار درصدگیری</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          درصد آزمون را با یا بدون نمره‌ی منفی محاسبه کنید.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <NumberField
            id="calc-total"
            label="کل سوالات"
            value={total}
            onChange={setTotal}
          />
          <NumberField
            id="calc-correct"
            label="صحیح"
            value={correct}
            onChange={setCorrect}
            accent="success"
          />
          <NumberField
            id="calc-wrong"
            label="غلط"
            value={wrong}
            onChange={setWrong}
            accent="error"
          />
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2">
          <Calculator className="size-4 text-muted-foreground" strokeWidth={2} />
          <span className="text-sm text-muted-foreground flex-1">
            نزده: <FaNum>{skipped}</FaNum>
          </span>
        </div>

        {invalid && (
          <p role="alert" className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
            مجموع «صحیح» و «غلط» نباید بیشتر از کل سوالات باشد.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="neg-switch" className="text-sm font-medium cursor-pointer">
              نمره‌ی منفی
            </Label>
            <p className="text-[11px] text-muted-foreground">
              صحیح +۳، غلط −۱
            </p>
          </div>
          <Switch
            id="neg-switch"
            checked={neg}
            onCheckedChange={setNeg}
          />
        </div>
      </div>

      {/* Result */}
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center text-center">
        <span className={cn("text-5xl font-bold tabular-nums", invalid ? "text-muted-foreground" : verdictColor)}>
          {invalid ? "—" : <FaNum>{finalPct}</FaNum>}
          <span className="text-2xl">٪</span>
        </span>
        {!invalid && (
          <span className={cn("mt-1 text-sm font-medium", verdictColor)}>
            {verdictText}
          </span>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 w-full">
          <MiniStat label="بدون نمره‌ی منفی" value={pctNoNeg} />
          <MiniStat label="با نمره‌ی منفی" value={pctNeg} />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3 text-[11px] text-muted-foreground leading-relaxed">
        <Info className="size-4 shrink-0 mt-0.5" strokeWidth={2} />
        <p>
          فرمول با نمره‌ی منفی: (صحیح × ۳ − غلط) ÷ (کل × ۳) × ۱۰۰.
          بدون نمره‌ی منفی: صحیح ÷ کل × ۱۰۰.
        </p>
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  accent,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  accent?: "success" | "error"
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        dir="ltr"
        className={cn(
          "h-11 text-center text-base font-semibold tabular-nums",
          accent === "success" && "focus-visible:border-success/60",
          accent === "error" && "focus-visible:border-destructive/60",
        )}
        value={ToPersianDigits(value)}
        onChange={(e) => onChange(ToLatinDigits(e.target.value))}
      />
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2.5">
      <p className="text-base font-bold tabular-nums">
        <FaNum>{value}</FaNum>٪
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
    </div>
  )
}
