
import * as React from "react"

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"]

/** Convert latin digits in a string to Persian digits. */
export function ToPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
}

/** Convert Persian/Arabic digits back to latin (for inputs/API). */
export function ToLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

/** Inline wrapper that renders its numeric/string children in Persian digits. */
export function FaNum({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const text =
    typeof children === "string" || typeof children === "number"
      ? ToPersianDigits(children)
      : children
  return <span className={className}>{text}</span>
}
