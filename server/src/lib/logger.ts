import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextFunction, Request, Response } from "express"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info"

function hereDir(): string {
  try {
    if (typeof __dirname !== "undefined") return __dirname as string
  } catch {
    /* ESM */
  }
  return dirname(fileURLToPath(import.meta.url))
}

function logDir(): string {
  if (process.env.LOG_DIR) return process.env.LOG_DIR
  // server/src/lib → repo root/logs (host-writable, gitignored via uploads-style rule)
  return resolve(hereDir(), "..", "..", "..", "logs")
}

function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function writeLine(stream: "app" | "client" | "request", line: string): void {
  try {
    const dir = logDir()
    ensureDir(dir)
    appendFileSync(resolve(dir, `${stream}-${dayKey()}.log`), `${line}\n`, { encoding: "utf8" })
  } catch {
    /* logging must never crash the request */
  }
}

function base(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  }
  return JSON.stringify(entry)
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return
  const line = base(level, message, meta)
  if (level === "error" || level === "warn") console.error(line)
  else console.log(line)
  writeLine("app", line)
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  log("info", message, meta)
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  log("warn", message, meta)
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  log("error", message, meta)
}

export function logClient(source: string, level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const line = base(level, `[client:${source}] ${message}`, meta)
  console.error(line)
  writeLine("client", line)
}

/** Request id + access log (method, path, status, duration, ip, user). */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  const reqId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  ;(req as Request & { reqId?: string }).reqId = reqId
  res.on("finish", () => {
    const ms = Date.now() - start
    // SAFETY: never log cookies/headers bodies — only shape + status.
    const line = base("info", "request", {
      reqId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
    })
    if (process.env.LOG_REQUESTS !== "false") console.log(line)
    writeLine("request", line)
  })
  next()
}

export function getReqId(req: Request): string | undefined {
  return (req as Request & { reqId?: string }).reqId
}
