
import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { transitionBase } from "@/lib/motion"
import { Eye, EyeOff, GraduationCap, Loader2, TriangleAlert, User, UserX } from "lucide-react"
import { useApp } from "@/lib/store"
import { apiFetch, ApiError } from "@/lib/api-client"
import { sanitizeUsername, sanitizeName, sanitizeEmail, clampPassword } from "@/lib/sanitize"
import type { AppUser } from "@/lib/store"
import { SocialButtons, type PendingOAuth } from "@/components/social-buttons"
import { useForm, FormErrors, type FormApi, type FieldRule } from "@/lib/use-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AnimatedTabs } from "@/components/animated-tabs"
import { cn, ICON_STROKE, ICON_STROKE_ACTION } from "@/lib/utils";

type Mode = "login" | "register"

const AUTH_TABS: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: "login", label: "ورود" },
  { value: "register", label: "ثبت‌نام" },
]

const FIELD_LABELS = {
  username: "نام کاربری",
  password: "رمز عبور",
  name: "نام و نام خانوادگی",
  email: "ایمیل",
} as const

const AUTH_FIELDS = ["name", "username", "password", "email"] as const

/** Single source for auth validation: same rules on blur and on submit. */
const AUTH_RULES: Record<"name" | "username" | "password" | "email", FieldRule> = {
  name: {
    label: "نام و نام خانوادگی",
    modes: ["register"],
    sanitize: sanitizeName,
    validate: (v) => (v.trim().length < 2 ? "نام حداقل ۲ نویسه باشد" : undefined),
  },
  username: {
    label: "نام کاربری",
    modes: ["login", "register"],
    sanitize: sanitizeUsername,
    validate: (v) =>
      /^[a-z0-9_.]{3,32}$/.test(v.trim()) ? undefined : "۳ تا ۳۲ نویسه (انگلیسی، عدد، _ یا نقطه)",
  },
  password: {
    label: "رمز عبور",
    modes: ["login", "register"],
    sanitize: clampPassword,
    validate: (v, mode) => {
      if (v.length < 1) return "رمز عبور را وارد کنید"

      if (
        mode === "register" &&
        (v.length < 8 || !(/[a-zA-Z]/.test(v) && /\d/.test(v)))
      ) {
        return "حداقل ۸ نویسه شامل حرف و عدد"
      }

      return undefined
    },
  },
  email: {
    label: "ایمیل",
    modes: ["register"],
    sanitize: sanitizeEmail,
    validate: (v) => {
      const e = v.trim().toLowerCase().replace(/\s+/g, "")

      if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return "ایمیل معتبر وارد کنید"
      }

      return undefined
    },
  },
}

export function AuthView() {
  const setUser = useApp((s) => s.setUser)
  const config = useApp((s) => s.config)
  // Server enforces this too — the closed screen is cosmetic.
  const registrationOpen = config?.registrationOpen !== false
  const registrationMessage = config?.registrationMessage?.trim() || null
  const [mode, setMode] = React.useState<Mode>("login")

  const form = useForm("auth", AUTH_FIELDS, AUTH_RULES, mode)
  const [field, setField] = React.useState<"FANI_HERFEI" | "KARDANESH">(
    "FANI_HERFEI",
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [showSummary, setShowSummary] = React.useState(false)
  // Social signup waiting for a study-field pick (verified profile is
  // parked server-side; nothing here is trusted input).
  const [pending, setPending] = React.useState<PendingOAuth | null>(null)

  // Social web flow lands back here with a pending cookie (no session
  // yet): pick up the verified profile for the field picker. 404 means
  // no pending signup — the normal case.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<{ profile: PendingOAuth }>("/api/auth/oauth/pending")

        if (!cancelled) setPending(res.profile)
      } catch {
        /* none pending */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const changeMode = (v: Mode): void => {
    setMode(v)
    setShowSummary(false)
  }

  /** Move keyboard focus to a field by id (submit errors, summary links). */
  const focusField = (id: string): void => {
    document.getElementById(id)?.focus()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const checked = form.validateAll(mode)

    if (!checked.ok) {
      setShowSummary(true)

      if (checked.firstInvalidId) focusField(checked.firstInvalidId)

      return
    }

    setShowSummary(false)
    setSubmitting(true)

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register"
      const body =
        mode === "login"
          ? { username: form.field("username").value, password: form.field("password").value }
          : {
              name: form.field("name").value.trim(),
              username: form.field("username").value,
              password: form.field("password").value,
              email: form.field("email").value.trim().toLowerCase().replace(/\s+/g, ""),
              field,
            }
      const res = await apiFetch<{ user: AppUser }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      })
      setUser(res.user)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "خطایی رخ داد. دوباره تلاش کنید."
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4">
              <GraduationCap className="size-7" strokeWidth={ICON_STROKE_ACTION} />
            </div>
            <h1 className="text-2xl font-bold">پودمان‌بان</h1>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              آزمون پودمانی هنرستان — تمرین، کارنامه و درصدگیری
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            {pending ? (
              <OAuthPending
                pending={pending}
                onDone={(u) => {
                  setPending(null)
                  setUser(u)
                }}
                onCancel={() => setPending(null)}
              />
            ) : (
            <AnimatedTabs
              tabs={AUTH_TABS}
              value={mode}
              // SAFETY: values come only from AUTH_TABS above, whose values are Modes.
              onValueChange={(v) => changeMode(v as Mode)}
            >
              {(active) => (
                <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={transitionBase}
                >
                {active === "login" ? (
                <>
                <AuthForm
                  mode="login"
                  form={form}
                  field={field}
                  submitting={submitting}
                  formError={formError}
                  showSummary={showSummary}
                  onErrorNavigate={focusField}
                  onFieldChange={setField}
                  onSubmit={submit}
                />
                <SocialButtons
                  enabled={config?.oauth ?? { google: false, github: false }}
                  disabled={submitting}
                  onDone={setUser}
                  onPending={setPending}
                  onError={setFormError}
                />
                </>
                ) : !registrationOpen ? (
                  <>
                    <RegistrationClosed
                      message={registrationMessage}
                      onBackToLogin={() => changeMode("login")}
                    />
                    <SocialButtons
                      enabled={config?.oauth ?? { google: false, github: false }}
                      disabled={submitting}
                      onDone={setUser}
                      onPending={setPending}
                      onError={setFormError}
                    />
                  </>
                ) : (
                  <>
                    <AuthForm
                      mode="register"
                      form={form}
                      field={field}
                      submitting={submitting}
                      formError={formError}
                      showSummary={showSummary}
                      onErrorNavigate={focusField}
                      onFieldChange={setField}
                      onSubmit={submit}
                    />
                    <SocialButtons
                      enabled={config?.oauth ?? { google: false, github: false }}
                      disabled={submitting}
                      onDone={setUser}
                      onPending={setPending}
                      onError={setFormError}
                    />
                  </>
                )}
                </motion.div>
                </AnimatePresence>
              )}
            </AnimatedTabs>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function RegistrationClosed({
  message,
  onBackToLogin,
}: {
  message: string | null
  onBackToLogin: () => void
}) {
  return (
    <div className="space-y-4 py-2 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <UserX className="size-6" strokeWidth={ICON_STROKE} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">ثبت‌نام بسته است</p>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {message ?? "ثبت‌نام جدید فعلاً توسط مدیر بسته شده است."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onBackToLogin}
        className="w-full h-11 text-base cursor-pointer"
      >
        بازگشت به ورود
      </Button>
    </div>
  )
}

/**
 * Study-field picker for a verified social profile that has no account
 * yet. The profile is parked server-side; this screen only collects the
 * one NOT NULL column the signup still needs.
 */
function OAuthPending({
  pending,
  onDone,
  onCancel,
}: {
  pending: PendingOAuth
  onDone: (user: AppUser) => void
  onCancel: () => void
}) {
  const [field, setField] = React.useState<"FANI_HERFEI" | "KARDANESH">("FANI_HERFEI")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const confirm = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await apiFetch<{ user: AppUser }>("/api/auth/oauth/complete", {
        method: "POST",
        body: JSON.stringify({ field }),
      })

      onDone(res.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطایی رخ داد. دوباره تلاش کنید.")
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1 text-center">
        <p className="text-base font-semibold">یک قدم مانده، {pending.name}</p>
        <p className="text-sm text-muted-foreground leading-relaxed" dir="ltr">
          {pending.email}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          رشته‌ات را انتخاب کن تا حسابت ساخته شود
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="رشته تحصیلی">
        {(["FANI_HERFEI", "KARDANESH"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={field === f}
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
      {error && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <Button
        type="button"
        onClick={() => void confirm()}
        disabled={submitting}
        className="w-full h-11 text-base cursor-pointer"
      >
        {submitting ? "در حال ساخت حساب…" : "ساخت حساب"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={submitting}
        className="w-full cursor-pointer"
      >
        انصراف
      </Button>
    </div>
  )
}

interface AuthFormProps {
  mode: Mode
  form: FormApi
  field: "FANI_HERFEI" | "KARDANESH"
  submitting: boolean
  formError: string | null
  showSummary: boolean
  onErrorNavigate: (id: string) => void
  onFieldChange: (f: "FANI_HERFEI" | "KARDANESH") => void
  onSubmit: (e: React.FormEvent) => void
}

function AuthForm(props: AuthFormProps) {
  const {
    mode,
    form,
    field,
    submitting,
    formError,
    showSummary,
    onErrorNavigate,
    onFieldChange,
    onSubmit,
  } = props

  const [showPassword, setShowPassword] = React.useState(false)
  const { error: nameError, ...nameProps } = form.field("name")
  const { error: usernameError, ...usernameProps } = form.field("username")
  const { error: passwordError, ...passwordProps } = form.field("password")
  const { error: emailError, ...emailProps } = form.field("email")

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {showSummary && (
        <FormErrors errors={form.summary(mode)} onNavigate={onErrorNavigate} />
      )}
      {mode === "register" && (
        <Field label={FIELD_LABELS.name} htmlFor="auth-name" error={nameError}>
          <Input
            {...nameProps}
            autoComplete="name"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "auth-name-error" : undefined}
            placeholder="مثلاً: علی رضایی"
            maxLength={40}
            className="h-11"
          />
        </Field>
      )}

      {mode === "register" && (
        <Field label={FIELD_LABELS.email} htmlFor="auth-email" error={emailError}>
          <Input
            {...emailProps}
            type="email"
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "auth-email-error" : undefined}
            placeholder="name@mail.com"
            maxLength={254}
            className="h-11 text-left tracking-wide"
            spellCheck={false}
            autoCapitalize="off"
          />
        </Field>
      )}

      <Field label={FIELD_LABELS.username} htmlFor="auth-username" error={usernameError}>
        <div className="relative">
          <User className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" strokeWidth={ICON_STROKE} />
          <Input
            {...usernameProps}
            autoComplete="username"
            dir="ltr"
            className="h-11 text-left tracking-wide pr-9"
            aria-invalid={!!usernameError}
            aria-describedby={usernameError ? "auth-username-error" : undefined}
            placeholder="username"
            maxLength={32}
            spellCheck={false}
            autoCapitalize="off"
          />
        </div>
      </Field>

      <Field label={FIELD_LABELS.password} htmlFor="auth-password" error={passwordError}>
        {mode === "register" && (
          <p role="note" className="mb-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <TriangleAlert className="size-4 shrink-0 text-warning" strokeWidth={ICON_STROKE} aria-hidden="true" />
            توجه: رمز عبور قابل بازیابی نیست — آن را دقیق وارد کنید و جایی امن نگه دارید.
          </p>
        )}
        <div className="relative">
          <Input
            {...passwordProps}
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            dir="ltr"
            className="h-11 text-left tracking-wide pl-9"
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? "auth-password-error" : undefined}
            placeholder="••••••••"
            maxLength={72}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
            aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      {mode === "register" && (
        <Field label="رشته تحصیلی" htmlFor="auth-field" error={undefined}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" id="auth-field">
            {(["FANI_HERFEI", "KARDANESH"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={field === f}
                onClick={() => onFieldChange(f)}
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
        </Field>
      )}

      {formError && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {formError}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-11 text-base cursor-pointer"
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting
          ? mode === "login"
            ? "در حال ورود…"
            : "در حال ثبت‌نام…"
          : mode === "login"
            ? "ورود"
            : "ثبت‌نام"}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
