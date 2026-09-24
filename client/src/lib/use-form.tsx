import * as React from "react"

/**
 * Tiny form hook: blur validation per field, full validation on submit.
 *
 * Contract:
 *  - `field(name)` returns `{ id, name, value, onChange, onBlur, error }`
 *    shaped to spread directly onto the Input component.
 *  - The FIRST failing rule of a field supplies its message; untouched
 *    fields stay silent until blur (single field) or submit (all fields).
 *  - `summary(mode)` lists the current errors for the active mode so the
 *    caller can render linked error summaries (see FormErrors below).
 *
 * Sanitizers run inside onChange (per-field, e.g. lowercasing usernames);
 * validators receive the sanitized value plus the caller mode, so one
 * hook serves both login and register with the same field names.
 */

export interface FieldRule {
  /** Persian label, used by the error summary links. */
  label: string
  /** Modes this field is validated (and shown) in. */
  modes: string[]
  sanitize?: (raw: string) => string
  validate: (value: string, mode: string) => string | undefined
}

export interface FieldBinding {
  id: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  error?: string
}

export interface FormErrorLink {
  id: string
  label: string
  message: string
}

interface FieldState {
  value: string
  touched: boolean
  error?: string
}

const emptyField: FieldState = { value: "", touched: false }

export function useForm(
  formId: string,
  names: readonly string[],
  rules: Record<string, FieldRule>,
  mode: string,
) {
  const [fields, setFields] = React.useState<Record<string, FieldState>>({})
  const modeRef = React.useRef(mode)
  modeRef.current = mode

  const runRule = (name: string, value: string): string | undefined => {
    const rule = rules[name]

    if (!rule || !rule.modes.includes(modeRef.current)) return undefined

    return rule.validate(value, modeRef.current)
  }

  const field = (name: string): FieldBinding => {
    const st = fields[name] ?? emptyField

    return {
      id: `${formId}-${name}`,
      name,
      value: st.value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const clean = rules[name]?.sanitize?.(e.target.value) ?? e.target.value
        setFields((s) => {
          const prev = s[name] ?? emptyField
          const message = prev.touched ? runRule(name, clean) : prev.error

          if (message === prev.error && clean === prev.value) return s

          return { ...s, [name]: { value: clean, touched: prev.touched, error: message } }
        })
      },
      onBlur: () => {
        setFields((s) => {
          const prev = s[name] ?? emptyField

          return { ...s, [name]: { value: prev.value, touched: true, error: runRule(name, prev.value) } }
        })
      },
      error: st.touched ? st.error : undefined,
    }
  }

  const validateAll = (activeMode: string) => {
    let first: string | null = null
    const next: Record<string, string> = {}
    const touched: Record<string, boolean> = {}

    for (const name of names) {
      const rule = rules[name]

      if (!rule || !rule.modes.includes(activeMode)) continue

      touched[name] = true

      const message = rule.validate(fields[name]?.value ?? "", activeMode)

      if (message) {
        next[name] = message

        if (first === null) first = `${formId}-${name}`
      }
    }

    setFields((s) => {
      const merged = { ...s }

      for (const name of Object.keys(touched)) {
        const prev = s[name] ?? emptyField
        merged[name] = { value: prev.value, touched: true, error: next[name] }
      }

      return merged
    })

    return { ok: first === null, firstInvalidId: first }
  }

  const errorsOf = (name: string): string | undefined => fields[name]?.error

  const summary = (activeMode: string): FormErrorLink[] => {
    const out: FormErrorLink[] = []

    for (const name of names) {
      const rule = rules[name]
      const message = errorsOf(name)

      if (!rule || !rule.modes.includes(activeMode) || !message) continue

      out.push({ id: `${formId}-${name}`, label: rule.label, message })
    }

    return out
  }

  return { field, validateAll, summary }
}

export interface FormApi {
  field: (name: string) => FieldBinding
  validateAll: (activeMode: string) => { ok: boolean; firstInvalidId: string | null }
  summary: (activeMode: string) => FormErrorLink[]
}

/**
 * Linked error summary: every entry jumps to (and focuses) its field.
 * Rendered only when the caller has attempted submit with errors —
 * role="alert" announces the list once, inline field errors persist.
 */
export function FormErrors({
  errors,
  onNavigate,
}: {
  errors: FormErrorLink[]
  onNavigate: (id: string) => void
}) {
  if (errors.length === 0) return null

  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
      <p className="text-sm font-medium text-destructive">لطفاً این موارد را اصلاح کنید:</p>
      <ul className="mt-1 space-y-1">
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              onClick={(e2) => {
                e2.preventDefault()
                onNavigate(e.id)
              }}
              className="text-xs text-destructive underline underline-offset-4 cursor-pointer"
            >
              {e.label}: {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
