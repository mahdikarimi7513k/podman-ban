import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Icon stroke widths (lucide): one named value per size class so every
 * section renders the same optical weight in both themes. Do not invent
 * new values — pick the constant matching the icon size.
 */
export const ICON_STROKE = 2

export const ICON_STROKE_ACTION = 2.25

export const ICON_STROKE_LARGE = 1.75

export const ICON_STROKE_DISPLAY = 1.5

export const ICON_STROKE_BADGE = 3
