
import * as React from "react"
import {
  Loader2,
  Upload,
  X,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  BookOpen,
  FileQuestion,
  Image as ImageIcon,
  Save,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { FaNum, ToPersianDigits } from "@/components/fa-utils"
import { useToast } from "@/hooks/use-toast"
import { cn, ICON_STROKE, ICON_STROKE_ACTION, ICON_STROKE_LARGE } from "@/lib/utils";

interface Book {
  id: string
  title: string
  field: "FANI_HERFEI" | "KARDANESH" | null
  order: number
  modules: {
    id: string
    title: string
    description: string | null
    order: number
    questionCount: number
  }[]
}

interface QuestionDetail {
  id: string
  moduleId: string
  text: string
  imageBase64: string | null
  options: string[]
  correctOption: number
  explanation: string | null
}

const LETTERS = ["الف", "ب", "ج", "د", "هـ", "و"]

export function AdminContent() {
  const { toast } = useToast()
  const [books, setBooks] = React.useState<Book[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [editingQuestion, setEditingQuestion] = React.useState<{
    moduleId: string
    question: QuestionDetail | null
  } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ books: Book[] }>("/api/admin/books")
      setBooks(res.books)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "بارگذاری محتوا ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    load()
  }, [load])

  // ---- book CRUD ----
  const [newBook, setNewBook] = React.useState({
    title: "",
    field: "FANI_HERFEI" as "FANI_HERFEI" | "KARDANESH" | null,
  })
  const addBook = async () => {
    if (!newBook.title.trim()) return
    try {
      await apiFetch("/api/admin/books", {
        method: "POST",
        body: JSON.stringify({ ...newBook, order: 0 }),
      })
      setNewBook({ title: "", field: "FANI_HERFEI" })
      await load()
    } catch (err) {
      toast({ variant: "destructive", title: "افزودن کتاب ناموفق بود", description: err instanceof ApiError ? err.message : undefined })
    }
  }
  const deleteBook = async (id: string, title: string) => {
    if (!confirm(`حذف کتاب «${title}»؟ همه‌ی پودمان‌ها، سوالات و سوابق آزمون‌هایش هم حذف می‌شوند.`))
      return
    try {
      await apiFetch(`/api/admin/books/${id}`, { method: "DELETE" })
      await load()
    } catch {
      toast({ variant: "destructive", title: "حذف ناموفق بود" })
    }
  }

  // ---- book edit ----
  const [editingBook, setEditingBook] = React.useState<Book | null>(null)
  const saveBookEdit = async (id: string, data: { title: string; field: "FANI_HERFEI" | "KARDANESH" | null; order: number }) => {
    try {
      await apiFetch(`/api/admin/books/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      })
      setEditingBook(null)
      await load()
      toast({ title: "کتاب به‌روزرسانی شد" })
    } catch (err) {
      toast({ variant: "destructive", title: "ذخیره ناموفق بود", description: err instanceof ApiError ? err.message : undefined })
    }
  }

  // ---- module CRUD ----
  const [newModule, setNewModule] = React.useState<{
    bookId: string
    title: string
  } | null>(null)
  const addModule = async () => {
    if (!newModule || !newModule.title.trim()) return
    try {
      await apiFetch("/api/admin/modules", {
        method: "POST",
        body: JSON.stringify({
          bookId: newModule.bookId,
          title: newModule.title,
          order: 0,
        }),
      })
      setNewModule(null)
      await load()
    } catch {
      toast({ variant: "destructive", title: "افزودن پودمان ناموفق بود" })
    }
  }
  const deleteModule = async (id: string, title: string) => {
    if (!confirm(`حذف پودمان «${title}»؟ همه‌ی سوالات و سوابق آزمون‌هایش هم حذف می‌شوند.`)) return
    try {
      await apiFetch(`/api/admin/modules/${id}`, { method: "DELETE" })
      await load()
    } catch {
      toast({ variant: "destructive", title: "حذف ناموفق بود" })
    }
  }

  // ---- module edit ----
  const [editingModule, setEditingModule] = React.useState<{
    id: string
    title: string
    description: string
    order: number
  } | null>(null)
  const saveModuleEdit = async (id: string, data: { title: string; description: string; order: number }) => {
    try {
      await apiFetch(`/api/admin/modules/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      })
      setEditingModule(null)
      await load()
      toast({ title: "پودمان به‌روزرسانی شد" })
    } catch (err) {
      toast({ variant: "destructive", title: "ذخیره ناموفق بود", description: err instanceof ApiError ? err.message : undefined })
    }
  }

  // ---- bulk import ----
  const [bulkImport, setBulkImport] = React.useState<{
    moduleId: string
    moduleTitle: string
  } | null>(null)

  // ---- question editor ----
  const openNewQuestion = (moduleId: string) => {
    setEditingQuestion({
      moduleId,
      question: {
        id: "",
        moduleId,
        text: "",
        imageBase64: null,
        options: ["", "", "", ""],
        correctOption: 0,
        explanation: "",
      },
    })
  }
  const openEditQuestion = async (moduleId: string, qid: string) => {
    try {
      const res = await apiFetch<{ question: QuestionDetail }>(
        `/api/admin/questions/${qid}`,
      )
      setEditingQuestion({ moduleId, question: res.question })
    } catch {
      toast({ variant: "destructive", title: "بارگذاری سوال ناموفق بود" })
    }
  }
  const deleteQuestion = async (qid: string) => {
    if (!confirm("حذف این سوال؟")) return
    try {
      await apiFetch(`/api/admin/questions/${qid}`, { method: "DELETE" })
      await load()
      setEditingQuestion(null)
    } catch {
      toast({ variant: "destructive", title: "حذف ناموفق بود" })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add book */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">افزودن کتاب جدید</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="عنوان کتاب"
            value={newBook.title}
            onChange={(e) => setNewBook((b) => ({ ...b, title: e.target.value }))}
            className="flex-1 h-10"
          />
          <Select
            value={newBook.field ?? "__SHARED__"}
            onValueChange={(v) =>
              setNewBook((b) => ({
                ...b,
                field: v === "__SHARED__" ? null : (v as "FANI_HERFEI" | "KARDANESH"),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-40 h-10 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FANI_HERFEI" className="cursor-pointer">شبکه</SelectItem>
              <SelectItem value="KARDANESH" className="cursor-pointer">حسابداری</SelectItem>
              <SelectItem value="__SHARED__" className="cursor-pointer">مشترک (هر دو)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={addBook} className="h-10 cursor-pointer shrink-0">
            <Plus className="size-4" strokeWidth={ICON_STROKE_ACTION} />
            افزودن
          </Button>
        </div>
      </section>

      {/* Books & modules */}
      {!books || books.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          هنوز کتابی ثبت نشده است.
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {books.map((book) => (
            <AccordionItem
              key={book.id}
              value={book.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-3 group">
                <AccordionTrigger className="flex-1 flex items-center gap-3 text-right hover:no-underline cursor-pointer p-0 h-auto" hideChevron>
                  <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground shrink-0">
                    <BookOpen className="size-4" strokeWidth={ICON_STROKE} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{book.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {book.field === null ? "مشترک" : book.field === "FANI_HERFEI" ? "شبکه" : "حسابداری"} —{" "}
                      <FaNum>{book.modules.length}</FaNum> پودمان
                    </p>
                  </div>
                  <ChevronLeft className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-data-[state=open]:-rotate-90" aria-hidden />
                </AccordionTrigger>
                <div
                  role="group"
                  aria-label="عملیات کتاب"
                  className="flex items-center gap-0.5 shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => setEditingBook(book)}
                    aria-label="ویرایش کتاب"
                    className="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteBook(book.id, book.title)}
                    aria-label="حذف کتاب"
                    className="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <AccordionContent className="px-2 pb-2">
                <ul className="space-y-1.5">
                  {book.modules.map((m) => (
                    <li key={m.id} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <FileQuestion className="size-3" strokeWidth={ICON_STROKE} />
                            <FaNum>{m.questionCount}</FaNum> سوال
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewModule({ bookId: book.id, title: "" })}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => openNewQuestion(m.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
                        >
                          <Plus className="size-3.5" strokeWidth={ICON_STROKE_ACTION} />
                            سوال
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkImport({ moduleId: m.id, moduleTitle: m.title })}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
                        >
                          <Upload className="size-3.5" strokeWidth={ICON_STROKE_ACTION} />
                          ورودی گروهی
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingModule({
                              id: m.id,
                              title: m.title,
                              description: m.description ?? "",
                              order: m.order,
                            })
                          }
                          aria-label="ویرایش پودمان"
                          className="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteModule(m.id, m.title)}
                          aria-label="حذف پودمان"
                          className="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      {/* inline question list link */}
                      <button
                        type="button"
                        onClick={() => setNewModule({ bookId: book.id, title: m.title })}
                        className="hidden"
                      />
                      <ModuleQuestions
                        moduleId={m.id}
                        onEditQuestion={(qid) => openEditQuestion(m.id, qid)}
                        onDeleteQuestion={deleteQuestion}
                      />
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => setNewModule({ bookId: book.id, title: "" })}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-accent/50 transition-colors cursor-pointer"
                    >
                      <Plus className="size-3.5" strokeWidth={ICON_STROKE_ACTION} />
                      افزودن پودمان
                    </button>
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* New module dialog */}
      <Dialog open={!!newModule} onOpenChange={(o) => !o && setNewModule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>افزودن پودمان</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-mod-title">عنوان پودمان</Label>
              <Input
                id="new-mod-title"
                autoFocus
                value={newModule?.title ?? ""}
                onChange={(e) =>
                  setNewModule((m) => (m ? { ...m, title: e.target.value } : m))
                }
                placeholder="مثلاً: پودمان اول — مفاهیم پایه"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewModule(null)} className="cursor-pointer">
              انصراف
            </Button>
            <Button onClick={addModule} disabled={!newModule?.title.trim()} className="cursor-pointer">
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question editor dialog */}
      {editingQuestion && (
        <QuestionEditor
          moduleId={editingQuestion.moduleId}
          question={editingQuestion.question}
          onClose={() => setEditingQuestion(null)}
          onSaved={async () => {
            setEditingQuestion(null)
            await load()
          }}
        />
      )}

      {/* Book edit dialog */}
      {editingBook && (
        <BookEditDialog
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onSave={(data) => saveBookEdit(editingBook.id, data)}
        />
      )}

      {/* Module edit dialog */}
      {editingModule && (
        <ModuleEditDialog
          module={editingModule}
          onClose={() => setEditingModule(null)}
          onSave={(data) => saveModuleEdit(editingModule.id, data)}
        />
      )}

      {/* Bulk import dialog */}
      {bulkImport && (
        <BulkImportDialog
          moduleId={bulkImport.moduleId}
          moduleTitle={bulkImport.moduleTitle}
          onClose={() => setBulkImport(null)}
          onImported={async () => {
            setBulkImport(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function BulkImportDialog({
  moduleId,
  moduleTitle,
  onClose,
  onImported,
}: {
  moduleId: string
  moduleTitle: string
  onClose: () => void
  onImported: () => void
}) {
  const { toast } = useToast()
  const [jsonText, setJsonText] = React.useState("")
  const [importing, setImporting] = React.useState(false)
  const [parsed, setParsed] = React.useState<
    Array<{ text: string; options: string[]; correctOption: number; explanation?: string }> | null
  >(null)
  const [error, setError] = React.useState<string | null>(null)

  const sample = `[
  {
    "text": "متن سوال اول",
    "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
    "correctOption": 0,
    "explanation": "توضیح اختیاری"
  },
  {
    "text": "متن سوال دوم",
    "options": ["الف", "ب", "ج", "د"],
    "correctOption": 2
  }
]`

  const parse = () => {
    setError(null)
    setParsed(null)
    try {
      const data = JSON.parse(jsonText)
      if (!Array.isArray(data)) {
        setError("ورودی باید یک آرایه باشد")
        return
      }
      for (let i = 0; i < data.length; i++) {
        const q = data[i]
        if (!q.text || typeof q.text !== "string") {
          setError(`سوال ${i + 1}: متن الزامی است`)
          return
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
          setError(`سوال ${i + 1}: حداقل ۲ گزینه لازم است`)
          return
        }
        if (typeof q.correctOption !== "number" || q.correctOption >= q.options.length) {
          setError(`سوال ${i + 1}: correctOption نامعتبر`)
          return
        }
      }
      setParsed(data)
    } catch {
      setError("JSON نامعتبر است")
    }
  }

  const importNow = async () => {
    if (!parsed) return
    setImporting(true)
    try {
      const res = await apiFetch<{ count: number }>("/api/admin/questions/bulk", {
        method: "POST",
        body: JSON.stringify({ moduleId, questions: parsed }),
      })

      toast({ title: `${ToPersianDigits(res.count)} سوال افزوده شد` })
      onImported()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ورودی ناموفق بود",
        description: err instanceof ApiError ? err.message : undefined,
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-mono">
        <DialogHeader>
          <DialogTitle>ورودی گروهی سوالات</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground truncate">{moduleTitle}</p>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-json">JSON سوالات</Label>
            <Textarea
              id="bulk-json"
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setParsed(null)
                setError(null)
              }}
              rows={8}
              placeholder={sample}
              className="resize-y min-h-[160px] font-mono text-xs"
              dir="ltr"
            />
          </div>
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {parsed && (
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs font-medium mb-1">پیش‌نمایش:</p>
              <p className="text-xs text-muted-foreground">
                <FaNum>{parsed.length}</FaNum> سوال آماده‌ی وارد کردن
              </p>
              <ul className="mt-1 space-y-0.5">
                {parsed.slice(0, 5).map((q, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground truncate">
                    <FaNum>{i + 1}.</FaNum> {q.text.slice(0, 50)}
                    {q.text.length > 50 ? "…" : ""}
                  </li>
                ))}
                {parsed.length > 5 && (
                  <li className="text-[10px] text-muted-foreground">و <FaNum>{parsed.length - 5}</FaNum> سوال دیگر…</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={parse}
              disabled={!jsonText.trim()}
              className="cursor-pointer flex-1"
            >
              بررسی JSON
            </Button>
            <Button
              size="sm"
              onClick={importNow}
              disabled={!parsed || importing}
              className="cursor-pointer flex-1"
            >
              {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              وارد کن (<FaNum>{parsed?.length ?? 0}</FaNum>)
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BookEditDialog({
  book,
  onClose,
  onSave,
}: {
  book: Book
  onClose: () => void
  onSave: (data: { title: string; field: "FANI_HERFEI" | "KARDANESH" | null; order: number }) => void
}) {
  const [title, setTitle] = React.useState(book.title)
  const [field, setField] = React.useState<"FANI_HERFEI" | "KARDANESH" | null>(book.field)
  const [order, setOrder] = React.useState(book.order)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ویرایش کتاب</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-book-title">عنوان کتاب</Label>
            <Input
              id="edit-book-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان کتاب"
            />
          </div>
          <div className="space-y-1.5">
            <Label>رشته</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["FANI_HERFEI", "شبکه"],
                ["KARDANESH", "حسابداری"],
                ["__SHARED__", "مشترک"],
              ] as const).map((f) => (
                <button
                  key={f[0]}
                  type="button"
                  onClick={() => setField(f[0] === "__SHARED__" ? null : f[0])}
                  className={cn(
                    "min-h-[44px] rounded-md border text-sm font-medium transition-colors cursor-pointer",
                    (f[0] === "__SHARED__" ? field === null : field === f[0])
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {f[1]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-book-order">ترتیب نمایش</Label>
            <Input
              id="edit-book-order"
              type="number"
              inputMode="numeric"
              value={String(order)}
              onChange={(e) => setOrder(Number(e.target.value) || 0)}
              dir="ltr"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">انصراف</Button>
          <Button
            onClick={() => onSave({ title: title.trim(), field, order })}
            disabled={!title.trim()}
            className="cursor-pointer"
          >
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModuleEditDialog({
  module,
  onClose,
  onSave,
}: {
  module: { id: string; title: string; description: string; order: number }
  onClose: () => void
  onSave: (data: { title: string; description: string; order: number }) => void
}) {
  const [title, setTitle] = React.useState(module.title)
  const [description, setDescription] = React.useState(module.description)
  const [order, setOrder] = React.useState(module.order)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ویرایش پودمان</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-mod-title">عنوان پودمان</Label>
            <Input
              id="edit-mod-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان پودمان"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-mod-desc">توضیحات (اختیاری)</Label>
            <Textarea
              id="edit-mod-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="توضیح کوتاه پودمان"
              className="resize-y min-h-[56px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-mod-order">ترتیب نمایش</Label>
            <Input
              id="edit-mod-order"
              type="number"
              inputMode="numeric"
              value={String(order)}
              onChange={(e) => setOrder(Number(e.target.value) || 0)}
              dir="ltr"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">انصراف</Button>
          <Button
            onClick={() => onSave({ title: title.trim(), description: description.trim(), order })}
            disabled={!title.trim()}
            className="cursor-pointer"
          >
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** List of questions in a module (fetched on demand when expanded). */
function ModuleQuestions({
  moduleId,
  onEditQuestion,
  onDeleteQuestion,
}: {
  moduleId: string
  onEditQuestion: (qid: string) => void
  onDeleteQuestion: (qid: string) => void
}) {
  const [questions, setQuestions] = React.useState<
    Array<{ id: string; text: string; hasImage: boolean; correctOption: number; options: string[] }>
  | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{
        questions: Array<{ id: string; text: string; hasImage: boolean; correctOption: number; options: string[] }>
      }>(`/api/admin/questions?moduleId=${encodeURIComponent(moduleId)}`)
      setQuestions(res.questions)
    } catch {
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }, [moduleId])

  React.useEffect(() => {
    if (open && questions === null) void load()
  }, [open, questions, load])

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronLeft className={cn("size-3 transition-transform", open && "-rotate-90")} />
        {open ? "بستن لیست سوالات" : "نمایش سوالات"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="size-3.5 animate-spin" />
              بارگذاری…
            </div>
          ) : !questions || questions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-1">سوالی ثبت نشده است.</p>
          ) : (
            questions.map((q, i) => (
              <div
                key={q.id}
                className="flex items-center gap-2 rounded-md bg-secondary/50 px-2.5 py-2"
              >
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  <FaNum>{i + 1}</FaNum>
                </span>
                {q.hasImage && <ImageIcon className="size-3 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />}
                <p className="text-xs flex-1 min-w-0 truncate">{q.text}</p>
                <button
                  type="button"
                  onClick={() => onEditQuestion(q.id)}
                  aria-label="ویرایش سوال"
                  className="size-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteQuestion(q.id)}
                  aria-label="حذف سوال"
                  className="size-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Question editor with image upload + variable options. */
function QuestionEditor({
  moduleId,
  question,
  onClose,
  onSaved,
}: {
  moduleId: string
  question: QuestionDetail | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = !!question?.id
  const [text, setText] = React.useState(question?.text ?? "")
  const [options, setOptions] = React.useState<string[]>(
    question?.options ?? ["", "", "", ""],
  )
  const [correctOption, setCorrectOption] = React.useState(
    question?.correctOption ?? 0,
  )
  const [explanation, setExplanation] = React.useState(question?.explanation ?? "")
  const [imageBase64, setImageBase64] = React.useState<string | null>(
    question?.imageBase64 ?? null,
  )
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "فقط تصویر قابل آپلود است" })
      return
    }
    if (file.size > 2_000_000) {
      toast({ variant: "destructive", title: "حداکثر ۲ مگابایت" })
      return
    }
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = () => {
        setImageBase64(reader.result as string)
        setUploading(false)
      }
      reader.onerror = () => {
        setUploading(false)
        toast({ variant: "destructive", title: "خواندن فایل ناموفق بود" })
      }
      reader.readAsDataURL(file)
    } catch {
      setUploading(false)
    }
  }

  const addOption = () => {
    if (options.length >= 6) return
    setOptions((o) => [...o, ""])
  }
  const removeOption = (i: number) => {
    if (options.length <= 2) return
    setOptions((o) => o.filter((_, idx) => idx !== i))
    if (correctOption >= options.length - 1) {
      setCorrectOption(options.length - 2)
    }
  }

  const save = async () => {
    if (!text.trim()) {
      toast({ variant: "destructive", title: "متن سوال الزامی است" })
      return
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean)
    if (cleanOptions.length < 2) {
      toast({ variant: "destructive", title: "حداقل ۲ گزینه لازم است" })
      return
    }
    setSaving(true)
    try {
      const body = {
        moduleId,
        text: text.trim(),
        imageBase64: imageBase64 || null,
        options: cleanOptions,
        correctOption:
          correctOption >= cleanOptions.length ? 0 : correctOption,
        explanation: explanation.trim() || undefined,
      }
      if (isEdit && question) {
        await apiFetch(`/api/admin/questions/${question.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
      } else {
        await apiFetch("/api/admin/questions", {
          method: "POST",
          body: JSON.stringify(body),
        })
      }
      toast({ title: isEdit ? "سوال به‌روزرسانی شد" : "سوال افزوده شد" })
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-mono">
        <DialogHeader>
          <DialogTitle>{isEdit ? "ویرایش سوال" : "سوال جدید"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* question text */}
          <div className="space-y-1.5">
            <Label htmlFor="q-text">متن سوال</Label>
            <Textarea
              id="q-text"
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="متن سوال (می‌تواند چندخطی باشد)"
              className="resize-y min-h-[88px]"
            />
          </div>

          {/* image upload */}
          <div className="space-y-1.5">
            <Label>تصویر سوال (اختیاری)</Label>
            {imageBase64 ? (
              <div className="relative inline-block">
                <img
                  src={imageBase64}
                  alt="پیش‌نمایش"
                  className="max-w-full max-h-48 rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={() => setImageBase64(null)}
                  aria-label="حذف تصویر"
                  className="absolute -top-2 -right-2 size-7 inline-flex items-center justify-center rounded-full bg-destructive text-white shadow cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-muted-foreground hover:bg-accent/40 transition-colors cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImageIcon className="size-6" strokeWidth={ICON_STROKE_LARGE} />
                )}
                <span className="text-xs">
                  {uploading ? "در حال بارگذاری…" : "برای انتخاب تصویر کلیک کنید"}
                </span>
                <span className="text-[10px]">حداکثر ۲ مگابایت — JPG/PNG/WebP</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ""
              }}
            />
          </div>

          {/* options */}
          <div className="space-y-2">
            <Label>گزینه‌ها</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectOption(i)}
                  aria-label={`گزینه ${LETTERS[i]} به‌عنوان پاسخ صحیح`}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors cursor-pointer",
                    correctOption === i
                      ? "border-success bg-success text-white"
                      : "border-border text-muted-foreground hover:border-foreground",
                  )}
                  title={correctOption === i ? "پاسخ صحیح" : "تنظیم به‌عنوان صحیح"}
                >
                  {correctOption === i ? "✓" : LETTERS[i]}
                </button>
                <Input
                  value={opt}
                  dir="auto"
                  onChange={(e) =>
                    setOptions((o) => o.map((x, idx) => (idx === i ? e.target.value : x)))
                  }
                  placeholder={`گزینه ${LETTERS[i]}`}
                  className="flex-1 h-10"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label="حذف گزینه"
                    className="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                className="cursor-pointer w-full"
              >
                <Plus className="size-3.5" strokeWidth={ICON_STROKE_ACTION} />
                افزودن گزینه
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              گزینه‌ای که علامت ✓ دارد، پاسخ صحیح است.
            </p>
          </div>

          {/* explanation */}
          <div className="space-y-1.5">
            <Label htmlFor="q-expl">توضیح پاسخ (اختیاری)</Label>
            <Textarea
              id="q-expl"
              dir="auto"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="توضیحی که پس از آزمون نمایش داده می‌شود"
              className="resize-y min-h-[56px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            انصراف
          </Button>
          <Button onClick={save} disabled={saving} className="cursor-pointer">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
