
import * as React from "react"
import { motion } from "framer-motion"
import { Archive, FileText, Download, CalendarDays, Building2, FolderOpen, ChevronLeft } from "lucide-react"
import { apiFetch, API_BASE } from "@/lib/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FaNum } from "@/components/fa-utils"

interface ArchiveFile {
  id: string
  title: string
  field: "FANI_HERFEI" | "KARDANESH"
  year: number
  month: number | null
  fileUrl: string | null
  answerUrl: string | null
  questionPath: string | null
  answerPath: string | null
  institution?: { id: string; name: string } | null
}

interface InstitutionGroup {
  id: string
  name: string
  files: ArchiveFile[]
}

const MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]

export function ArchiveView() {
  const [institutions, setInstitutions] = React.useState<InstitutionGroup[] | null>(null)
  const [ungrouped, setUngrouped] = React.useState<ArchiveFile[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<{
          institutions: InstitutionGroup[]
          ungrouped: ArchiveFile[]
        }>("/api/archive")
        if (!cancelled) {
          setInstitutions(res.institutions)
          setUngrouped(res.ungrouped)
        }
      } catch {
        if (!cancelled) {
          setInstitutions([])
          setUngrouped([])
        }
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
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  const hasData =
    (institutions && institutions.length > 0) || ungrouped.length > 0

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <div className="relative flex size-16 items-center justify-center mx-auto mb-3">
          <div className="absolute inset-0 rounded-full bg-secondary" />
          <Archive className="relative size-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium">هنوز موردی در آرشیو وجود ندارد.</p>
        <p className="text-xs text-muted-foreground mt-1">مدیر می‌تواند فایل‌های آرشیو را اضافه کند.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-balance">آرشیو آزمون‌ها</h1>
        <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
          آزمون‌های نهایی موسسات مختلف به همراه پاسخنامه.
        </p>
      </div>

      {/* Institutions accordion */}
      {institutions && institutions.length > 0 && (
        <Accordion type="multiple" defaultValue={institutions[0] ? [institutions[0].id] : []} className="space-y-3">
          {institutions.map((inst, idx) => (
            <motion.div
              key={inst.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05, ease: [0.2, 0, 0, 1] }}
            >
              <AccordionItem
                value={inst.id}
                className="rounded-lg border border-border bg-card card-elevated overflow-hidden"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline cursor-pointer group" hideChevron>
                  <div className="flex items-center gap-3 flex-1 text-right">
                    <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground shrink-0">
                      <Building2 className="size-4" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{inst.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <FaNum>{inst.files.length}</FaNum> آزمون
                      </p>
                    </div>
                  </div>
                  <ChevronLeft
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-data-[state=open]:-rotate-90"
                    aria-hidden
                  />
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  <ul className="space-y-1.5">
                    {inst.files.map((f) => (
                      <FileItem key={f.id} file={f} />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      )}

      {/* Ungrouped files */}
      {ungrouped.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="size-4 text-muted-foreground" strokeWidth={2} />
            <h2 className="text-sm font-semibold">سایر فایل‌ها</h2>
          </div>
          <ul className="space-y-2">
            {ungrouped.map((f) => (
              <FileItem key={f.id} file={f} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FileItem({ file: f }: { file: ArchiveFile }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/30 hover:border-foreground/20"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <FileText className="size-4" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-relaxed">{f.title}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3" strokeWidth={2} />
            <span dir="ltr">
              {f.month ? `${MONTHS[f.month - 1]} ` : ""}
              <FaNum>{f.year}</FaNum>
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {/* Questions: prefer the uploaded copy, fall back to an external link */}
        {(f.questionPath || f.fileUrl) && (
          <Button asChild size="sm" variant="default" className="cursor-pointer flex-1">
            <a
              href={f.questionPath ? `${API_BASE}/api/archive/file/${f.id}/question` : (f.fileUrl ?? "#")}
              {...(f.questionPath ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" })}
            >
              <Download className="size-3.5" strokeWidth={2.25} />
              دانلود سوالات
            </a>
          </Button>
        )}
        {/* Answer key: same pattern, optional */}
        {(f.answerPath || f.answerUrl) && (
          <Button asChild size="sm" variant="outline" className="cursor-pointer flex-1">
            <a
              href={f.answerPath ? `${API_BASE}/api/archive/file/${f.id}/answer` : (f.answerUrl ?? "#")}
              {...(f.answerPath ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" })}
            >
              <FileText className="size-3.5" strokeWidth={2.25} />
              پاسخنامه
            </a>
          </Button>
        )}
      </div>
    </motion.li>
  )
}
