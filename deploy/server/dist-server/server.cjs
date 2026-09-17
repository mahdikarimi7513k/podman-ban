"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc6) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc6 = __getOwnPropDesc(from, key)) || desc6.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_fs4 = require("fs");
var import_path3 = require("path");
var import_url3 = require("url");
var import_express10 = __toESM(require("express"), 1);

// src/lib/load-env.ts
var import_fs = require("fs");
var import_path = require("path");
var import_url = require("url");
var import_meta = {};
var here = typeof __dirname !== "undefined" ? __dirname : (0, import_path.dirname)((0, import_url.fileURLToPath)(import_meta.url));
function findRepoRoot() {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if ((0, import_fs.existsSync)((0, import_path.resolve)(dir, "client"))) return dir;
    const up = (0, import_path.dirname)(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}
var ROOT_ENV = (0, import_path.resolve)(findRepoRoot(), ".env");
try {
  const text2 = (0, import_fs.readFileSync)(ROOT_ENV, "utf8");
  for (const rawLine of text2.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq12 = line.indexOf("=");
    if (eq12 === -1) continue;
    const key = line.slice(0, eq12).trim();
    let value = line.slice(eq12 + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
}
if (process.env.NODE_ENV === "production") {
  for (const k of ["JWT_SECRET", "CSRF_SECRET"]) {
    const v = process.env[k] ?? "";
    if (!v || v.length < 32 || v.includes("change-me")) {
      throw new Error(
        `${k} must be set to a long random value in production (openssl rand -hex 32)`
      );
    }
  }
  if ((process.env.JWT_SECRET ?? "") === (process.env.CSRF_SECRET ?? "")) {
    throw new Error("JWT_SECRET and CSRF_SECRET must differ");
  }
}

// src/app.ts
var import_express9 = __toESM(require("express"), 1);
var import_cookie_parser = __toESM(require("cookie-parser"), 1);
var import_cors = __toESM(require("cors"), 1);

// src/routes/auth.routes.ts
var import_express = require("express");

// src/lib/auth/password.ts
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var SALT_ROUNDS = 12;
async function hashPassword(plain) {
  return import_bcryptjs.default.hash(plain, SALT_ROUNDS);
}
async function verifyPassword(plain, hash) {
  return import_bcryptjs.default.compare(plain, hash);
}

// src/lib/auth/jwt.ts
var import_jose = require("jose");
var enc = new TextEncoder();
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return enc.encode(s);
}
var ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL_SEC ?? 900);
var REFRESH_TTL_SEC = Number(process.env.JWT_REFRESH_TTL_SEC ?? 604800);
async function signAccessToken(payload) {
  return new import_jose.SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime(`${ACCESS_TTL_SEC}s`).setIssuer("podman-ban").setAudience("podman-ban-users").sign(secret());
}
async function verifyAccessToken(token) {
  try {
    const { payload } = await (0, import_jose.jwtVerify)(token, secret(), {
      issuer: "podman-ban",
      audience: "podman-ban-users"
    });
    return payload;
  } catch {
    return null;
  }
}
async function signRefreshToken(payload) {
  return new import_jose.SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime(`${REFRESH_TTL_SEC}s`).setIssuer("podman-ban").setAudience("podman-ban-refresh").sign(secret());
}
async function verifyRefreshToken(token) {
  try {
    const { payload } = await (0, import_jose.jwtVerify)(token, secret(), {
      issuer: "podman-ban",
      audience: "podman-ban-refresh"
    });
    return payload;
  } catch {
    return null;
  }
}

// src/lib/auth/csrf.ts
var import_crypto = require("crypto");
function secret2() {
  const s = process.env.CSRF_SECRET;
  if (!s) throw new Error("CSRF_SECRET is not set");
  return s;
}
function issueCsrfToken(userId) {
  return (0, import_crypto.createHmac)("sha256", secret2()).update(userId).digest("base64url");
}
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return (0, import_crypto.timingSafeEqual)(ab, bb);
}
function verifyCsrf(args) {
  const { header, cookie, userId } = args;
  if (!header || !cookie) return false;
  const expected = issueCsrfToken(userId);
  return safeEqual(header, cookie) && safeEqual(cookie, expected);
}

// src/lib/auth/rate-limit.ts
var buckets = /* @__PURE__ */ new Map();
var sinceSweep = 0;
function maybeSweep() {
  sinceSweep++;
  if (sinceSweep < 500) return;
  sinceSweep = 0;
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}
function rateLimit(key, limit, windowSec) {
  maybeSweep();
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowSec * 1e3;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (entry.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1e3)
    };
  }
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, retryAfterSec: 0 };
}
function clientIp(req) {
  if (process.env.TRUST_PROXY === "true") {
    const xff = req.headers["x-forwarded-for"];
    const first = Array.isArray(xff) ? xff[0] : xff;
    if (typeof first === "string" && first) return first.split(",")[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

// src/lib/auth/cookies.ts
var ACCESS_COOKIE = "pb_access";
var REFRESH_COOKIE = "pb_refresh";
var CSRF_COOKIE = "pb_csrf";
var isProd = process.env.NODE_ENV === "production";
function cookieSameSite() {
  const v = (process.env.COOKIE_SAMESITE ?? "strict").toLowerCase();
  return v === "none" || v === "lax" ? v : "strict";
}
function cookieSecure() {
  if (cookieSameSite() === "none") return true;
  return process.env.COOKIE_SECURE === "true";
}
function authCookieAttrs(maxAgeSec, path = "/") {
  const expires = new Date(Date.now() + maxAgeSec * 1e3);
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path,
    expires
  };
}
function setAuthCookies(res, args) {
  res.cookie(ACCESS_COOKIE, args.accessToken, authCookieAttrs(ACCESS_TTL_SEC, "/"));
  res.cookie(
    REFRESH_COOKIE,
    args.refreshToken,
    authCookieAttrs(REFRESH_TTL_SEC, "/api/auth")
  );
  res.cookie(CSRF_COOKIE, args.csrfToken, {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: "/",
    expires: new Date(Date.now() + REFRESH_TTL_SEC * 1e3)
  });
}
function clearAuthCookies(res) {
  const names = [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE];
  for (const n of names) {
    const path = n === REFRESH_COOKIE ? "/api/auth" : "/";
    res.clearCookie(n, {
      httpOnly: n !== CSRF_COOKIE,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      path,
      expires: /* @__PURE__ */ new Date(0)
    });
  }
}
function readCookie(req, name) {
  const v = req.cookies?.[name];
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function readCookieFromHeader(cookieHeader, name) {
  if (!cookieHeader) return void 0;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return void 0;
}

// src/lib/auth/session.ts
var import_crypto2 = require("crypto");
var import_drizzle_orm3 = require("drizzle-orm");

// src/lib/db.ts
var import_node_module = require("node:module");
var import_node_path = require("node:path");
var import_node_url = require("node:url");
var import_drizzle_orm2 = require("drizzle-orm");

// src/lib/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  ChatSender: () => ChatSender,
  ExamStatus: () => ExamStatus,
  StudyField: () => StudyField,
  UserRole: () => UserRole,
  answers: () => answers,
  answersRelations: () => answersRelations,
  archiveFiles: () => archiveFiles,
  archiveFilesRelations: () => archiveFilesRelations,
  books: () => books,
  booksRelations: () => booksRelations,
  chatMessages: () => chatMessages,
  chatMessagesRelations: () => chatMessagesRelations,
  examSessions: () => examSessions,
  examSessionsRelations: () => examSessionsRelations,
  institutions: () => institutions,
  institutionsRelations: () => institutionsRelations,
  modules: () => modules,
  modulesRelations: () => modulesRelations,
  questions: () => questions,
  questionsRelations: () => questionsRelations,
  refreshTokens: () => refreshTokens,
  refreshTokensRelations: () => refreshTokensRelations,
  remoteConfig: () => remoteConfig,
  users: () => users,
  usersRelations: () => usersRelations
});
var import_node_crypto = require("node:crypto");
var import_sqlite_core = require("drizzle-orm/sqlite-core");
var import_drizzle_orm = require("drizzle-orm");
var UserRole = { STUDENT: "STUDENT", ADMIN: "ADMIN", CONTENT_ADMIN: "CONTENT_ADMIN" };
var StudyField = { FANI_HERFEI: "FANI_HERFEI", KARDANESH: "KARDANESH" };
var ExamStatus = { IN_PROGRESS: "IN_PROGRESS", FINISHED: "FINISHED", ABANDONED: "ABANDONED" };
var ChatSender = { STUDENT: "STUDENT", ADMIN: "ADMIN" };
var id = (name) => (0, import_sqlite_core.text)(name).primaryKey().$defaultFn(() => (0, import_node_crypto.randomUUID)());
var createdAt = (name) => (0, import_sqlite_core.integer)(name, { mode: "timestamp_ms" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date());
var users = (0, import_sqlite_core.sqliteTable)("User", {
  id: id("id"),
  username: (0, import_sqlite_core.text)("username").notNull().unique(),
  name: (0, import_sqlite_core.text)("name").notNull(),
  passwordHash: (0, import_sqlite_core.text)("passwordHash").notNull(),
  field: (0, import_sqlite_core.text)("field").notNull().$type(),
  role: (0, import_sqlite_core.text)("role").notNull().default("STUDENT").$type(),
  prefs: (0, import_sqlite_core.text)("prefs").notNull().default("{}"),
  totalTests: (0, import_sqlite_core.integer)("totalTests").notNull().default(0),
  createdAt: createdAt("createdAt"),
  updatedAt: (0, import_sqlite_core.integer)("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()).$onUpdateFn(() => /* @__PURE__ */ new Date())
});
var refreshTokens = (0, import_sqlite_core.sqliteTable)("RefreshToken", {
  id: id("id"),
  userId: (0, import_sqlite_core.text)("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: (0, import_sqlite_core.text)("tokenHash").notNull().unique(),
  family: (0, import_sqlite_core.text)("family").notNull(),
  userAgent: (0, import_sqlite_core.text)("userAgent"),
  ip: (0, import_sqlite_core.text)("ip"),
  createdAt: createdAt("createdAt"),
  expiresAt: (0, import_sqlite_core.integer)("expiresAt", { mode: "timestamp_ms" }).notNull(),
  revokedAt: (0, import_sqlite_core.integer)("revokedAt", { mode: "timestamp_ms" })
}, (t) => [(0, import_sqlite_core.index)("RefreshToken_userId_idx").on(t.userId), (0, import_sqlite_core.index)("RefreshToken_family_idx").on(t.family)]);
var books = (0, import_sqlite_core.sqliteTable)("Book", {
  id: id("id"),
  title: (0, import_sqlite_core.text)("title").notNull(),
  field: (0, import_sqlite_core.text)("field").$type(),
  order: (0, import_sqlite_core.integer)("order").notNull().default(0),
  createdAt: createdAt("createdAt")
}, (t) => [(0, import_sqlite_core.index)("Book_field_idx").on(t.field)]);
var modules = (0, import_sqlite_core.sqliteTable)("Module", {
  id: id("id"),
  bookId: (0, import_sqlite_core.text)("bookId").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: (0, import_sqlite_core.text)("title").notNull(),
  description: (0, import_sqlite_core.text)("description"),
  order: (0, import_sqlite_core.integer)("order").notNull().default(0),
  createdAt: createdAt("createdAt")
}, (t) => [(0, import_sqlite_core.index)("Module_bookId_idx").on(t.bookId)]);
var questions = (0, import_sqlite_core.sqliteTable)("Question", {
  id: id("id"),
  moduleId: (0, import_sqlite_core.text)("moduleId").notNull().references(() => modules.id, { onDelete: "cascade" }),
  text: (0, import_sqlite_core.text)("text").notNull(),
  imageBase64: (0, import_sqlite_core.text)("imageBase64"),
  options: (0, import_sqlite_core.text)("options").notNull(),
  correctOption: (0, import_sqlite_core.integer)("correctOption").notNull(),
  explanation: (0, import_sqlite_core.text)("explanation"),
  createdAt: createdAt("createdAt")
}, (t) => [(0, import_sqlite_core.index)("Question_moduleId_idx").on(t.moduleId)]);
var examSessions = (0, import_sqlite_core.sqliteTable)("ExamSession", {
  id: id("id"),
  userId: (0, import_sqlite_core.text)("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: (0, import_sqlite_core.text)("moduleId").notNull().references(() => modules.id, { onDelete: "restrict" }),
  status: (0, import_sqlite_core.text)("status").notNull().default("IN_PROGRESS").$type(),
  startedAt: (0, import_sqlite_core.integer)("startedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  finishedAt: (0, import_sqlite_core.integer)("finishedAt", { mode: "timestamp_ms" }),
  durationSec: (0, import_sqlite_core.integer)("durationSec").notNull(),
  totalQuestions: (0, import_sqlite_core.integer)("totalQuestions").notNull(),
  correctCount: (0, import_sqlite_core.integer)("correctCount").notNull().default(0),
  wrongCount: (0, import_sqlite_core.integer)("wrongCount").notNull().default(0),
  skippedCount: (0, import_sqlite_core.integer)("skippedCount").notNull().default(0),
  scorePercent: (0, import_sqlite_core.integer)("scorePercent").notNull().default(0),
  negativeMarking: (0, import_sqlite_core.integer)("negativeMarking", { mode: "boolean" }).notNull().default(true),
  isPractice: (0, import_sqlite_core.integer)("isPractice", { mode: "boolean" }).notNull().default(false),
  questionOrder: (0, import_sqlite_core.text)("questionOrder").notNull()
}, (t) => [(0, import_sqlite_core.index)("ExamSession_userId_status_idx").on(t.userId, t.status), (0, import_sqlite_core.index)("ExamSession_status_isPractice_idx").on(t.status, t.isPractice)]);
var answers = (0, import_sqlite_core.sqliteTable)("Answer", {
  id: id("id"),
  sessionId: (0, import_sqlite_core.text)("sessionId").notNull().references(() => examSessions.id, { onDelete: "cascade" }),
  questionId: (0, import_sqlite_core.text)("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  selectedOption: (0, import_sqlite_core.integer)("selectedOption"),
  isCorrect: (0, import_sqlite_core.integer)("isCorrect", { mode: "boolean" }),
  timeSpentMs: (0, import_sqlite_core.integer)("timeSpentMs").notNull().default(0),
  answeredAt: (0, import_sqlite_core.integer)("answeredAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (t) => [
  (0, import_sqlite_core.unique)("Answer_sessionId_questionId_key").on(t.sessionId, t.questionId),
  (0, import_sqlite_core.index)("Answer_sessionId_idx").on(t.sessionId),
  (0, import_sqlite_core.index)("Answer_answeredAt_idx").on(t.answeredAt)
]);
var remoteConfig = (0, import_sqlite_core.sqliteTable)("RemoteConfig", {
  id: (0, import_sqlite_core.text)("id").primaryKey().default("singleton"),
  siteLocked: (0, import_sqlite_core.integer)("siteLocked", { mode: "boolean" }).notNull().default(false),
  lockMessage: (0, import_sqlite_core.text)("lockMessage").notNull().default(""),
  bannerText: (0, import_sqlite_core.text)("bannerText").notNull().default(""),
  bannerLink: (0, import_sqlite_core.text)("bannerLink").notNull().default(""),
  bannerActive: (0, import_sqlite_core.integer)("bannerActive", { mode: "boolean" }).notNull().default(false),
  defaultTimerMin: (0, import_sqlite_core.integer)("defaultTimerMin").notNull().default(20),
  negativeMarking: (0, import_sqlite_core.integer)("negativeMarking", { mode: "boolean" }).notNull().default(true),
  registrationOpen: (0, import_sqlite_core.integer)("registrationOpen", { mode: "boolean" }).notNull().default(true),
  registrationMessage: (0, import_sqlite_core.text)("registrationMessage").notNull().default(""),
  externalApiKeyHash: (0, import_sqlite_core.text)("externalApiKeyHash"),
  externalApiKeyPrefix: (0, import_sqlite_core.text)("externalApiKeyPrefix").notNull().default(""),
  updatedAt: (0, import_sqlite_core.integer)("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()).$onUpdateFn(() => /* @__PURE__ */ new Date())
});
var chatMessages = (0, import_sqlite_core.sqliteTable)("ChatMessage", {
  id: id("id"),
  userId: (0, import_sqlite_core.text)("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  sender: (0, import_sqlite_core.text)("sender").notNull().$type(),
  text: (0, import_sqlite_core.text)("text").notNull(),
  createdAt: (0, import_sqlite_core.integer)("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  readAt: (0, import_sqlite_core.integer)("readAt", { mode: "timestamp_ms" })
}, (t) => [(0, import_sqlite_core.index)("ChatMessage_userId_createdAt_idx").on(t.userId, t.createdAt)]);
var institutions = (0, import_sqlite_core.sqliteTable)("Institution", {
  id: id("id"),
  name: (0, import_sqlite_core.text)("name").notNull().unique(),
  order: (0, import_sqlite_core.integer)("order").notNull().default(0),
  createdAt: createdAt("createdAt")
});
var archiveFiles = (0, import_sqlite_core.sqliteTable)("ArchiveFile", {
  id: id("id"),
  title: (0, import_sqlite_core.text)("title").notNull(),
  field: (0, import_sqlite_core.text)("field").notNull().$type(),
  year: (0, import_sqlite_core.integer)("year").notNull(),
  month: (0, import_sqlite_core.integer)("month"),
  fileUrl: (0, import_sqlite_core.text)("fileUrl"),
  answerUrl: (0, import_sqlite_core.text)("answerUrl"),
  questionPath: (0, import_sqlite_core.text)("questionPath"),
  answerPath: (0, import_sqlite_core.text)("answerPath"),
  institutionId: (0, import_sqlite_core.text)("institutionId").references(() => institutions.id, { onDelete: "set null" }),
  createdAt: createdAt("createdAt")
}, (t) => [(0, import_sqlite_core.index)("ArchiveFile_field_year_idx").on(t.field, t.year), (0, import_sqlite_core.index)("ArchiveFile_institutionId_idx").on(t.institutionId)]);
var usersRelations = (0, import_drizzle_orm.relations)(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  examSessions: many(examSessions),
  chatMessages: many(chatMessages)
}));
var refreshTokensRelations = (0, import_drizzle_orm.relations)(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] })
}));
var booksRelations = (0, import_drizzle_orm.relations)(books, ({ many }) => ({
  modules: many(modules)
}));
var modulesRelations = (0, import_drizzle_orm.relations)(modules, ({ one, many }) => ({
  book: one(books, { fields: [modules.bookId], references: [books.id] }),
  questions: many(questions),
  examSessions: many(examSessions)
}));
var questionsRelations = (0, import_drizzle_orm.relations)(questions, ({ one, many }) => ({
  module: one(modules, { fields: [questions.moduleId], references: [modules.id] }),
  answers: many(answers)
}));
var examSessionsRelations = (0, import_drizzle_orm.relations)(examSessions, ({ one, many }) => ({
  user: one(users, { fields: [examSessions.userId], references: [users.id] }),
  module: one(modules, { fields: [examSessions.moduleId], references: [modules.id] }),
  answers: many(answers)
}));
var answersRelations = (0, import_drizzle_orm.relations)(answers, ({ one }) => ({
  session: one(examSessions, { fields: [answers.sessionId], references: [examSessions.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] })
}));
var chatMessagesRelations = (0, import_drizzle_orm.relations)(chatMessages, ({ one }) => ({
  user: one(users, { fields: [chatMessages.userId], references: [users.id] })
}));
var institutionsRelations = (0, import_drizzle_orm.relations)(institutions, ({ many }) => ({
  files: many(archiveFiles)
}));
var archiveFilesRelations = (0, import_drizzle_orm.relations)(archiveFiles, ({ one }) => ({
  institution: one(institutions, { fields: [archiveFiles.institutionId], references: [institutions.id] })
}));

// src/lib/db.ts
var import_meta2 = {};
var cjsRequire = typeof module !== "undefined" && module?.require ? module.require.bind(module) : (0, import_node_module.createRequire)(import_meta2.url);
var here2 = typeof __dirname !== "undefined" ? __dirname : (0, import_node_path.dirname)((0, import_node_url.fileURLToPath)(import_meta2.url));
var PRISMA_DIR = (0, import_node_path.resolve)(here2, "..", "..", "prisma");
function dbPath() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  if (file === ":memory:") return file;
  return (0, import_node_path.isAbsolute)(file) ? file : (0, import_node_path.resolve)(PRISMA_DIR, file);
}
var logger = process.env.DEBUG_DB === "true" ? new import_drizzle_orm2.DefaultLogger() : void 0;
function openDatabase() {
  const path = dbPath();
  try {
    const { Database } = cjsRequire("bun:sqlite");
    const { drizzle: drizzleBun } = cjsRequire("drizzle-orm/bun-sqlite");
    const client = new Database(path);
    client.exec("PRAGMA foreign_keys = ON");
    const bunClient = client;
    return drizzleBun(bunClient, { schema: schema_exports, logger });
  } catch {
    const Better = cjsRequire("better-sqlite3");
    const { drizzle: drizzleBetter } = cjsRequire("drizzle-orm/better-sqlite3");
    const client = new Better(path);
    client.exec("PRAGMA foreign_keys = ON");
    return drizzleBetter(client, { schema: schema_exports, logger });
  }
}
var db = openDatabase();

// src/lib/auth/session.ts
function sha256(s) {
  return (0, import_crypto2.createHash)("sha256").update(s).digest("hex");
}
function headerString(v) {
  if (v == null) return void 0;
  return Array.isArray(v) ? v[0] : v;
}
async function getSession(req) {
  const token = readCookie(req, ACCESS_COOKIE);
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload) return null;
  const fresh = await db.select({ id: users.id, name: users.name, role: users.role, field: users.field }).from(users).where((0, import_drizzle_orm3.eq)(users.id, payload.sub)).get();
  if (!fresh) return null;
  return {
    id: fresh.id,
    name: fresh.name,
    role: fresh.role,
    field: fresh.field
  };
}
async function requireUser(req, res) {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return null;
  }
  return user;
}
async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "CONTENT_ADMIN") {
    res.status(403).json({ error: "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632" });
    return null;
  }
  return user;
}
async function requireSuperAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "\u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0641\u0642\u0637 \u0628\u0631\u0627\u06CC \u0645\u062F\u06CC\u0631 \u0627\u0635\u0644\u06CC \u0645\u062C\u0627\u0632 \u0627\u0633\u062A" });
    return null;
  }
  return user;
}
async function requireCsrf(user, req) {
  const header = headerString(req.headers["x-csrf-token"]);
  const cookie = readCookie(req, CSRF_COOKIE);
  return verifyCsrf({ header, cookie, userId: user.id });
}
async function issueSession(user, req, res) {
  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    field: user.field
  });
  const family = (0, import_crypto2.randomUUID)();
  const jti = (0, import_crypto2.randomUUID)();
  const refreshToken = await signRefreshToken({ sub: user.id, jti, fam: family });
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    family,
    userAgent: headerString(req.headers["user-agent"]) ?? null,
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1e3)
  });
  setAuthCookies(res, {
    accessToken,
    refreshToken,
    csrfToken: issueCsrfToken(user.id)
  });
}
async function rotateRefreshToken(req, res) {
  const token = readCookie(req, REFRESH_COOKIE);
  if (!token) return null;
  const payload = await verifyRefreshToken(token);
  if (!payload) return null;
  const hash = sha256(token);
  const record = await db.select().from(refreshTokens).where((0, import_drizzle_orm3.eq)(refreshTokens.tokenHash, hash)).get();
  if (!record) {
    await db.update(refreshTokens).set({ revokedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(refreshTokens.family, payload.fam), (0, import_drizzle_orm3.isNull)(refreshTokens.revokedAt))).run();
    return null;
  }
  if (record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
    await db.update(refreshTokens).set({ revokedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(refreshTokens.family, payload.fam), (0, import_drizzle_orm3.isNull)(refreshTokens.revokedAt))).run();
    return null;
  }
  const user = await db.select().from(users).where((0, import_drizzle_orm3.eq)(users.id, payload.sub)).get();
  if (!user) return null;
  const revoked = await db.update(refreshTokens).set({ revokedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(refreshTokens.id, record.id), (0, import_drizzle_orm3.isNull)(refreshTokens.revokedAt))).run();
  if (revoked.changes === 0) {
    await db.update(refreshTokens).set({ revokedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(refreshTokens.family, payload.fam), (0, import_drizzle_orm3.isNull)(refreshTokens.revokedAt))).run();
    return null;
  }
  const newJti = (0, import_crypto2.randomUUID)();
  const newRefresh = await signRefreshToken({
    sub: user.id,
    jti: newJti,
    fam: payload.fam
  });
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: sha256(newRefresh),
    family: payload.fam,
    userAgent: headerString(req.headers["user-agent"]) ?? null,
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1e3)
  });
  const sessionUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    field: user.field
  };
  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    field: user.field
  });
  setAuthCookies(res, {
    accessToken,
    refreshToken: newRefresh,
    csrfToken: issueCsrfToken(user.id)
  });
  return sessionUser;
}
async function logout(req, res) {
  const token = readCookie(req, REFRESH_COOKIE);
  if (token) {
    const hash = sha256(token);
    await db.update(refreshTokens).set({ revokedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(refreshTokens.tokenHash, hash), (0, import_drizzle_orm3.isNull)(refreshTokens.revokedAt))).run();
  }
  clearAuthCookies(res);
}

// src/routes/auth.routes.ts
var import_drizzle_orm5 = require("drizzle-orm");

// src/lib/validations.ts
var import_zod = require("zod");
function parseBody(schema, body, res) {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(422).json({ error: result.error.issues[0]?.message ?? "\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return null;
  }
  return result.data;
}
var usernameSchema = import_zod.z.string().trim().toLowerCase().transform((v) => v.replace(/\s+/g, "")).refine((v) => /^[a-z0-9_.]{3,32}$/.test(v), {
  message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627\u06CC\u062F \u06F3 \u062A\u0627 \u06F3\u06F2 \u0646\u0648\u06CC\u0633\u0647 (\u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC\u060C \u0639\u062F\u062F\u060C _ \u06CC\u0627 \u0646\u0642\u0637\u0647) \u0628\u0627\u0634\u062F"
});
var passwordSchema = import_zod.z.string().min(8, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062D\u062F\u0627\u0642\u0644 \u06F8 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F").max(72, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F7\u06F2 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F").refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
  message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u0634\u0627\u0645\u0644 \u062D\u0631\u0641 \u0648 \u0639\u062F\u062F \u0628\u0627\u0634\u062F"
});
var nameSchema = import_zod.z.string().trim().min(2, "\u0646\u0627\u0645 \u062D\u062F\u0627\u0642\u0644 \u06F2 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F").max(40, "\u0646\u0627\u0645 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F4\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F");
var registerSchema = import_zod.z.object({
  name: nameSchema,
  username: usernameSchema,
  password: passwordSchema,
  field: import_zod.z.enum(["FANI_HERFEI", "KARDANESH"])
});
var loginSchema = import_zod.z.object({
  username: usernameSchema,
  password: import_zod.z.string().min(1, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F")
});
var externalVerifySchema = loginSchema.extend({
  field: import_zod.z.enum(["FANI_HERFEI", "KARDANESH"]).optional()
});
var startExamSchema = import_zod.z.object({
  moduleId: import_zod.z.string().min(1),
  durationMin: import_zod.z.number().int().min(1).max(180).optional(),
  practice: import_zod.z.boolean().optional()
});
var answerSchema = import_zod.z.object({
  questionId: import_zod.z.string().min(1),
  // questions may carry 2..6 options → index range 0..5; the engine also
  // validates the index against the question's real options.length
  selectedOption: import_zod.z.number().int().min(0).max(5).nullable(),
  timeSpentMs: import_zod.z.number().int().min(0).optional()
});
var finishSchema = import_zod.z.object({
  force: import_zod.z.boolean().optional()
});
var prefsSchema = import_zod.z.object({
  repeatQuestions: import_zod.z.boolean().optional(),
  examDurationMin: import_zod.z.number().int().min(5).max(180).optional(),
  theme: import_zod.z.enum(["dark", "light", "system"]).optional(),
  dailyGoal: import_zod.z.number().int().min(5).max(200).optional()
});
var bookCreateSchema = import_zod.z.object({
  title: import_zod.z.string().trim().min(1).max(120),
  // null/omitted = shared book visible to BOTH fields
  field: import_zod.z.enum(["FANI_HERFEI", "KARDANESH"]).nullable().optional(),
  order: import_zod.z.number().int().default(0)
});
var bookUpdateSchema = bookCreateSchema.partial();
var moduleCreateSchema = import_zod.z.object({
  bookId: import_zod.z.string().min(1),
  title: import_zod.z.string().trim().min(1).max(120),
  description: import_zod.z.string().trim().max(400).optional(),
  order: import_zod.z.number().int().default(0)
});
var moduleUpdateSchema = moduleCreateSchema.partial().omit({ bookId: true });
var questionCreateSchema = import_zod.z.object({
  moduleId: import_zod.z.string().min(1),
  text: import_zod.z.string().trim().min(1).max(2e3),
  options: import_zod.z.array(import_zod.z.string().trim().min(1).max(500)).min(2).max(6),
  correctOption: import_zod.z.number().int().min(0).max(5),
  explanation: import_zod.z.string().trim().max(1e3).optional(),
  imageBase64: import_zod.z.string().max(25e5, "\u062A\u0635\u0648\u06CC\u0631 \u062E\u06CC\u0644\u06CC \u0628\u0632\u0631\u06AF \u0627\u0633\u062A (\u062D\u062F\u0627\u06A9\u062B\u0631 \u06F2 \u0645\u06AF\u0627\u0628\u0627\u06CC\u062A)").refine(
    (v) => !v || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
    "\u062A\u0635\u0648\u06CC\u0631 \u0628\u0627\u06CC\u062F \u06CC\u06A9 data URL \u0645\u0639\u062A\u0628\u0631 (png\u060C jpg\u060C webp \u06CC\u0627 gif) \u0628\u0627\u0634\u062F"
  ).optional().nullable()
});
var questionUpdateSchema = questionCreateSchema.partial().omit({ moduleId: true });
var archiveCreateSchema = import_zod.z.object({
  title: import_zod.z.string().trim().min(1).max(200),
  field: import_zod.z.enum(["FANI_HERFEI", "KARDANESH"]),
  year: import_zod.z.number().int().min(1300).max(1500),
  month: import_zod.z.number().int().min(1).max(12).nullable().optional(),
  // Link OR uploaded file — the route enforces "at least one deliverable".
  fileUrl: import_zod.z.string().trim().max(1e3).refine((v) => v === "" || /^https?:\/\//i.test(v), "\u0644\u06CC\u0646\u06A9 \u0628\u0627\u06CC\u062F \u0628\u0627 http(s) \u0634\u0631\u0648\u0639 \u0634\u0648\u062F").optional().nullable(),
  answerUrl: import_zod.z.string().trim().max(1e3).refine((v) => v === "" || /^https?:\/\//i.test(v), "\u0644\u06CC\u0646\u06A9 \u0628\u0627\u06CC\u062F \u0628\u0627 http(s) \u0634\u0631\u0648\u0639 \u0634\u0648\u062F").optional().nullable(),
  institutionId: import_zod.z.string().optional().nullable()
});
var remoteConfigUpdateSchema = import_zod.z.object({
  siteLocked: import_zod.z.boolean().optional(),
  lockMessage: import_zod.z.string().max(500).optional(),
  bannerText: import_zod.z.string().max(300).optional(),
  // Same scheme allowlist as archive fileUrl/answerUrl above: the banner
  // renders as <a href> for every student, so javascript:/data:/etc. here
  // would be stored XSS. Empty string clears the link.
  bannerLink: import_zod.z.string().trim().max(1e3).refine((v) => v === "" || /^https?:\/\//i.test(v), "\u0644\u06CC\u0646\u06A9 \u0628\u0627\u06CC\u062F \u0628\u0627 http(s) \u0634\u0631\u0648\u0639 \u0634\u0648\u062F").optional(),
  bannerActive: import_zod.z.boolean().optional(),
  defaultTimerMin: import_zod.z.number().int().min(1).max(180).optional(),
  negativeMarking: import_zod.z.boolean().optional(),
  registrationOpen: import_zod.z.boolean().optional(),
  registrationMessage: import_zod.z.string().max(500).optional()
});
var chatSendSchema = import_zod.z.object({
  text: import_zod.z.string().trim().min(1).max(2e3)
});

// src/lib/remote-config.ts
var import_drizzle_orm4 = require("drizzle-orm");
var cache = null;
var CACHE_TTL_MS = 2e3;
async function getAppState() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state;
  let row = await db.select().from(remoteConfig).where((0, import_drizzle_orm4.eq)(remoteConfig.id, "singleton")).get();
  if (!row) {
    row = await db.insert(remoteConfig).values({ id: "singleton" }).returning().get();
  }
  const state = {
    siteLocked: row.siteLocked,
    lockMessage: row.lockMessage,
    bannerText: row.bannerText,
    bannerLink: row.bannerLink,
    bannerActive: row.bannerActive,
    defaultTimerMin: row.defaultTimerMin,
    negativeMarking: row.negativeMarking,
    registrationOpen: row.registrationOpen,
    registrationMessage: row.registrationMessage,
    externalApiEnabled: !!row.externalApiKeyHash,
    externalApiKeyPrefix: row.externalApiKeyPrefix ?? ""
  };
  cache = { state, at: Date.now() };
  return state;
}
var PATCHABLE = [
  "siteLocked",
  "lockMessage",
  "bannerText",
  "bannerLink",
  "bannerActive",
  "defaultTimerMin",
  "negativeMarking",
  "registrationOpen",
  "registrationMessage",
  "externalApiKeyHash",
  "externalApiKeyPrefix"
];
async function updateAppState(patch) {
  const clean = {};
  for (const k of PATCHABLE) {
    const v = patch[k];
    if (v !== void 0) clean[k] = v;
  }
  await db.insert(remoteConfig).values({ id: "singleton", ...clean }).onConflictDoUpdate({ target: remoteConfig.id, set: { ...clean, updatedAt: /* @__PURE__ */ new Date() } }).run();
  cache = null;
  return getAppState();
}

// src/routes/auth.routes.ts
var authRouter = (0, import_express.Router)();
authRouter.post("/auth/register", async (req, res) => {
  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`, 10, 300);
  if (!rl.ok) {
    res.status(429).json({ error: "\u062A\u0644\u0627\u0634\u200C\u0647\u0627\u06CC \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F", retryAfter: rl.retryAfterSec });
    return;
  }
  const data = parseBody(registerSchema, req.body, res);
  if (!data) return;
  const appState = await getAppState();
  if (!appState.registrationOpen) {
    res.status(403).json({
      error: "\u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u0641\u0639\u0644\u0627\u064B \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631 \u0628\u0633\u062A\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A",
      code: "REGISTRATION_CLOSED"
    });
    return;
  }
  const { name, username, password, field } = data;
  const existing = await db.select({ id: users.id }).from(users).where((0, import_drizzle_orm5.eq)(users.username, username)).get();
  if (existing) {
    res.status(409).json({ error: "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await db.insert(users).values({ name, username, passwordHash, field, role: "STUDENT" }).returning().get();
  await issueSession(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      field: user.field
    },
    req,
    res
  );
  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      field: user.field,
      role: user.role
    }
  });
});
var DUMMY_HASH = "$2b$12$bICd1dH9gm9g2f404qXxEeA8Ttha/6IG4yRgDwXKJgjbylyvwD2ia";
authRouter.post("/auth/login", async (req, res) => {
  const ip = clientIp(req);
  const parsedBody = parseBody(loginSchema, req.body, res);
  if (!parsedBody) return;
  const rlIp = rateLimit(`login-ip:${ip}`, 30, 300);
  const rlUser = rateLimit(`login-u:${ip}:${parsedBody.username}`, 8, 300);
  if (!rlIp.ok || !rlUser.ok) {
    res.status(429).json({
      error: "\u062A\u0644\u0627\u0634\u200C\u0647\u0627\u06CC \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F",
      retryAfterSec: Math.max(rlIp.retryAfterSec, rlUser.retryAfterSec)
    });
    return;
  }
  const { username, password } = parsedBody;
  const user = await db.select().from(users).where((0, import_drizzle_orm5.eq)(users.username, username)).get();
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    res.status(401).json({ error: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A" });
    return;
  }
  await issueSession(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      field: user.field
    },
    req,
    res
  );
  res.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      field: user.field,
      role: user.role,
      totalTests: user.totalTests
    }
  });
});
authRouter.post("/auth/logout", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  await logout(req, res);
  res.json({ ok: true });
});
authRouter.post("/auth/refresh", async (req, res) => {
  const user = await rotateRefreshToken(req, res);
  if (!user) {
    res.status(401).json({ error: "\u0646\u0634\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A \u2014 \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  res.json({
    user: { id: user.id, name: user.name, role: user.role, field: user.field }
  });
});
authRouter.get("/auth/me", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const dbUser = await db.select({
    id: users.id,
    name: users.name,
    username: users.username,
    field: users.field,
    role: users.role,
    totalTests: users.totalTests,
    prefs: users.prefs,
    createdAt: users.createdAt
  }).from(users).where((0, import_drizzle_orm5.eq)(users.id, user.id)).get();
  if (!dbUser) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  res.json({
    user: dbUser,
    csrf: issueCsrfToken(user.id)
  });
});
authRouter.get("/csrf", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  res.json({ csrf: issueCsrfToken(user.id) });
});
authRouter.get("/config", async (_req, res) => {
  const state = await getAppState();
  res.json({ state });
});

// src/routes/exam.routes.ts
var import_express2 = require("express");
var import_zod2 = require("zod");
var import_drizzle_orm8 = require("drizzle-orm");

// src/lib/exam-engine.ts
var import_drizzle_orm6 = require("drizzle-orm");
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
async function startExam(userId, moduleId, opts = {}) {
  const mod = await db.query.modules.findFirst({
    where: (0, import_drizzle_orm6.eq)(modules.id, moduleId),
    with: { book: true, questions: { columns: { id: true } } }
  });
  if (!mod || !mod.book) throw new Error("MODULE_NOT_FOUND");
  const cfg = await getAppState();
  const isPractice = opts.practice ?? false;
  const durationMin = opts.durationMin ?? cfg.defaultTimerMin;
  const negativeMarking = isPractice ? false : cfg.negativeMarking;
  const allowRepeat = opts.repeatQuestions ?? true;
  let pool = mod.questions.map((q) => q.id);
  if (!allowRepeat && pool.length > 0) {
    const finishedIds = await db.select({ id: examSessions.id }).from(examSessions).where(
      (0, import_drizzle_orm6.and)(
        (0, import_drizzle_orm6.eq)(examSessions.userId, userId),
        (0, import_drizzle_orm6.eq)(examSessions.moduleId, moduleId),
        (0, import_drizzle_orm6.eq)(examSessions.status, "FINISHED")
      )
    ).all();
    const answered = finishedIds.length > 0 ? await db.selectDistinct({ questionId: answers.questionId }).from(answers).where(
      (0, import_drizzle_orm6.inArray)(
        answers.sessionId,
        finishedIds.map((s) => s.id)
      )
    ).all() : [];
    const seen = new Set(answered.map((a) => a.questionId));
    const fresh = pool.filter((id2) => !seen.has(id2));
    if (fresh.length >= Math.min(3, pool.length)) {
      pool = fresh;
    }
  }
  const questionOrder = shuffle(pool);
  const session = await db.insert(examSessions).values({
    userId,
    moduleId,
    durationSec: durationMin * 60,
    totalQuestions: questionOrder.length,
    negativeMarking,
    isPractice,
    questionOrder: JSON.stringify(questionOrder)
  }).returning().get();
  return {
    sessionId: session.id,
    moduleId: mod.id,
    moduleTitle: mod.title,
    bookTitle: mod.book.title,
    totalQuestions: questionOrder.length,
    durationSec: durationMin * 60,
    negativeMarking,
    questionOrder,
    startedAt: session.startedAt.toISOString()
  };
}
var ANSWER_GRACE_MS = 5e3;
async function recordAnswer(sessionId, userId, questionId, selectedOption, timeSpentMs = 0) {
  const session = await db.select({
    id: examSessions.id,
    userId: examSessions.userId,
    moduleId: examSessions.moduleId,
    status: examSessions.status,
    startedAt: examSessions.startedAt,
    durationSec: examSessions.durationSec,
    questionOrder: examSessions.questionOrder
  }).from(examSessions).where((0, import_drizzle_orm6.eq)(examSessions.id, sessionId)).get();
  if (!session || session.userId !== userId) return { ok: false, code: "NOT_FOUND" };
  if (session.status !== "IN_PROGRESS") return { ok: false, code: "NOT_IN_PROGRESS" };
  const questionIds = JSON.parse(session.questionOrder);
  if (!questionIds.includes(questionId)) return { ok: false, code: "QUESTION_NOT_FOUND" };
  const rl = rateLimit(`answer:${sessionId}`, 120, 60);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };
  const deadline = session.startedAt.getTime() + session.durationSec * 1e3;
  if (Date.now() > deadline + ANSWER_GRACE_MS) {
    return { ok: false, code: "EXPIRED" };
  }
  const question = await db.select({
    correctOption: questions.correctOption,
    moduleId: questions.moduleId,
    options: questions.options
  }).from(questions).where((0, import_drizzle_orm6.eq)(questions.id, questionId)).get();
  if (!question || question.moduleId !== session.moduleId) {
    return { ok: false, code: "QUESTION_NOT_FOUND" };
  }
  let optionCount = question.options.length;
  if (typeof question.options === "string") {
    try {
      optionCount = JSON.parse(question.options).length;
    } catch {
      optionCount = 0;
    }
  }
  if (selectedOption !== null && (selectedOption < 0 || selectedOption >= optionCount)) {
    return { ok: false, code: "INVALID_OPTION" };
  }
  const isCorrect = selectedOption === null ? null : selectedOption === question.correctOption;
  await db.insert(answers).values({ sessionId, questionId, selectedOption, isCorrect, timeSpentMs }).onConflictDoUpdate({
    target: [answers.sessionId, answers.questionId],
    set: { selectedOption, isCorrect, timeSpentMs, answeredAt: /* @__PURE__ */ new Date() }
  }).run();
  return { ok: true };
}
async function finishExam(sessionId, userId) {
  const session = await db.query.examSessions.findFirst({
    where: (0, import_drizzle_orm6.eq)(examSessions.id, sessionId),
    with: { answers: true }
  });
  if (!session || session.userId !== userId) throw new Error("NOT_FOUND");
  if (session.status === "FINISHED") {
    return {
      sessionId: session.id,
      totalQuestions: session.totalQuestions,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      skippedCount: session.skippedCount,
      scorePercent: session.scorePercent,
      negativeMarking: session.negativeMarking
    };
  }
  const correct = session.answers.filter((a) => a.isCorrect === true).length;
  const wrong = session.answers.filter((a) => a.isCorrect === false).length;
  const skipped = session.totalQuestions - correct - wrong;
  const scorePercent = computeScore({
    correct,
    wrong,
    total: session.totalQuestions,
    negativeMarking: session.negativeMarking
  });
  const transition = await db.update(examSessions).set({
    status: "FINISHED",
    finishedAt: /* @__PURE__ */ new Date(),
    correctCount: correct,
    wrongCount: wrong,
    skippedCount: skipped,
    scorePercent
  }).where(
    (0, import_drizzle_orm6.and)(
      (0, import_drizzle_orm6.eq)(examSessions.id, sessionId),
      (0, import_drizzle_orm6.eq)(examSessions.userId, userId),
      (0, import_drizzle_orm6.eq)(examSessions.status, "IN_PROGRESS")
    )
  ).run();
  if (transition.changes === 1) {
    await db.update(users).set({ totalTests: import_drizzle_orm6.sql`${users.totalTests} + 1` }).where((0, import_drizzle_orm6.eq)(users.id, userId)).run();
  } else {
    const stored = await db.select().from(examSessions).where((0, import_drizzle_orm6.eq)(examSessions.id, sessionId)).get();
    if (stored && stored.status === "FINISHED") {
      return {
        sessionId: stored.id,
        totalQuestions: stored.totalQuestions,
        correctCount: stored.correctCount,
        wrongCount: stored.wrongCount,
        skippedCount: stored.skippedCount,
        scorePercent: stored.scorePercent,
        negativeMarking: stored.negativeMarking
      };
    }
  }
  return {
    sessionId,
    totalQuestions: session.totalQuestions,
    correctCount: correct,
    wrongCount: wrong,
    skippedCount: skipped,
    scorePercent,
    negativeMarking: session.negativeMarking
  };
}
function computeScore(args) {
  const { correct, wrong, total, negativeMarking } = args;
  if (total <= 0) return 0;
  let raw;
  let max2;
  if (negativeMarking) {
    raw = correct * 3 - wrong * 1;
    max2 = total * 3;
  } else {
    raw = correct;
    max2 = total;
  }
  const pct = Math.round(raw / max2 * 100);
  return Math.max(0, Math.min(100, pct));
}
async function getUserProgress(userId, field) {
  const mods = await db.select({ id: modules.id, title: modules.title, bookTitle: books.title }).from(modules).innerJoin(books, (0, import_drizzle_orm6.eq)(modules.bookId, books.id)).where(field ? (0, import_drizzle_orm6.or)((0, import_drizzle_orm6.eq)(books.field, field), (0, import_drizzle_orm6.isNull)(books.field)) : void 0).orderBy((0, import_drizzle_orm6.asc)(modules.order)).all();
  const sessions = await db.select({
    moduleId: examSessions.moduleId,
    scorePercent: examSessions.scorePercent,
    finishedAt: examSessions.finishedAt
  }).from(examSessions).where((0, import_drizzle_orm6.and)((0, import_drizzle_orm6.eq)(examSessions.userId, userId), (0, import_drizzle_orm6.eq)(examSessions.status, "FINISHED"))).orderBy((0, import_drizzle_orm6.desc)(examSessions.finishedAt)).all();
  const agg = /* @__PURE__ */ new Map();
  for (const s of sessions) {
    let a = agg.get(s.moduleId);
    if (!a) {
      a = { attempts: 0, lastScore: null, lastAt: null, best: -1 };
      agg.set(s.moduleId, a);
    }
    a.attempts += 1;
    if (!a.lastAt || s.finishedAt && s.finishedAt > a.lastAt) {
      a.lastScore = s.scorePercent;
      a.lastAt = s.finishedAt;
    }
    if (s.scorePercent > a.best) a.best = s.scorePercent;
  }
  return mods.map((m) => {
    const a = agg.get(m.id);
    return {
      moduleId: m.id,
      moduleTitle: m.title,
      bookTitle: m.bookTitle,
      attempts: a?.attempts ?? 0,
      lastScorePercent: a?.lastScore ?? null,
      bestScorePercent: a && a.best >= 0 ? a.best : null,
      lastFinishedAt: a?.lastAt?.toISOString() ?? null
    };
  });
}

// src/lib/question-bank.ts
var import_drizzle_orm7 = require("drizzle-orm");
async function listBooks(field) {
  const bookRows = await db.select().from(books).where(field ? (0, import_drizzle_orm7.or)((0, import_drizzle_orm7.eq)(books.field, field), (0, import_drizzle_orm7.isNull)(books.field)) : void 0).orderBy((0, import_drizzle_orm7.asc)(books.order), (0, import_drizzle_orm7.asc)(books.title)).all();
  const moduleRows = await db.select().from(modules).where(
    bookRows.length > 0 ? (0, import_drizzle_orm7.inArray)(
      modules.bookId,
      bookRows.map((b) => b.id)
    ) : void 0
  ).orderBy((0, import_drizzle_orm7.asc)(modules.order)).all();
  const counts = await db.select({ moduleId: questions.moduleId, n: (0, import_drizzle_orm7.count)() }).from(questions).where(
    moduleRows.length > 0 ? (0, import_drizzle_orm7.inArray)(
      questions.moduleId,
      moduleRows.map((m) => m.id)
    ) : void 0
  ).groupBy(questions.moduleId).all();
  const countByModule = new Map(counts.map((c) => [c.moduleId, c.n]));
  const modulesByBook = /* @__PURE__ */ new Map();
  for (const m of moduleRows) {
    const list = modulesByBook.get(m.bookId) ?? [];
    list.push(m);
    modulesByBook.set(m.bookId, list);
  }
  return bookRows.map((b) => ({
    id: b.id,
    title: b.title,
    field: b.field,
    order: b.order,
    modules: (modulesByBook.get(b.id) ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.order,
      questionCount: countByModule.get(m.id) ?? 0
    }))
  }));
}
async function getQuestionsForExam(moduleId, questionIds) {
  const conds = [(0, import_drizzle_orm7.eq)(questions.moduleId, moduleId)];
  if (questionIds) conds.push((0, import_drizzle_orm7.inArray)(questions.id, questionIds));
  const qRows = await db.select({
    id: questions.id,
    text: questions.text,
    options: questions.options,
    imageBase64: questions.imageBase64
  }).from(questions).where((0, import_drizzle_orm7.and)(...conds)).all();
  const byId = new Map(qRows.map((q) => [q.id, q]));
  const ordered = questionIds ? questionIds.map((id2) => byId.get(id2)).filter((q) => Boolean(q)) : qRows;
  return ordered.map((q, i) => ({
    id: q.id,
    text: q.text,
    options: JSON.parse(q.options),
    imageBase64: q.imageBase64,
    order: i + 1
  }));
}
async function getQuestionsForReview(moduleId, questionIds) {
  const rRows = await db.select({
    id: questions.id,
    text: questions.text,
    imageBase64: questions.imageBase64,
    options: questions.options,
    correctOption: questions.correctOption,
    explanation: questions.explanation
  }).from(questions).where((0, import_drizzle_orm7.inArray)(questions.id, questionIds)).all();
  const byId = new Map(rRows.map((q) => [q.id, q]));
  return questionIds.map((id2) => byId.get(id2)).filter((q) => Boolean(q)).map((q, i) => ({
    id: q.id,
    text: q.text,
    imageBase64: q.imageBase64,
    options: JSON.parse(q.options),
    correctOption: q.correctOption,
    explanation: q.explanation,
    order: i + 1
  }));
}

// src/routes/exam.routes.ts
var examRouter = (0, import_express2.Router)();
examRouter.get("/books", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const books2 = await listBooks(user.field);
  res.json({ books: books2 });
});
examRouter.post("/exam/start", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const rl = rateLimit(`exam-start:${user.id}`, 30, 600);
  if (!rl.ok) {
    res.status(429).json({ error: "\u062A\u0639\u062F\u0627\u062F \u0634\u0631\u0648\u0639 \u0622\u0632\u0645\u0648\u0646 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(startExamSchema, req.body, res);
  if (!data) return;
  const { moduleId, durationMin } = data;
  const practice = data.practice ?? false;
  const mod = await db.query.modules.findFirst({
    where: (0, import_drizzle_orm8.eq)(modules.id, moduleId),
    with: { book: { columns: { field: true } } }
  });
  if (!mod || mod.book.field !== null && mod.book.field !== user.field) {
    res.status(403).json({ error: "\u0627\u06CC\u0646 \u067E\u0648\u062F\u0645\u0627\u0646 \u0628\u0631\u0627\u06CC \u0631\u0634\u062A\u0647 \u0634\u0645\u0627 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A" });
    return;
  }
  let repeatQuestions = true;
  try {
    const dbUser = await db.select({ prefs: users.prefs }).from(users).where((0, import_drizzle_orm8.eq)(users.id, user.id)).get();
    if (dbUser?.prefs) {
      const prefs = JSON.parse(dbUser.prefs);
      if (typeof prefs.repeatQuestions === "boolean") {
        repeatQuestions = prefs.repeatQuestions;
      }
    }
  } catch {
  }
  const started = await startExam(user.id, moduleId, {
    durationMin,
    repeatQuestions,
    practice
  });
  res.json({ session: started });
});
examRouter.get("/exam/sessions", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const rows = await db.select({
    id: examSessions.id,
    moduleId: examSessions.moduleId,
    scorePercent: examSessions.scorePercent,
    correctCount: examSessions.correctCount,
    wrongCount: examSessions.wrongCount,
    skippedCount: examSessions.skippedCount,
    totalQuestions: examSessions.totalQuestions,
    negativeMarking: examSessions.negativeMarking,
    startedAt: examSessions.startedAt,
    finishedAt: examSessions.finishedAt,
    moduleTitle: modules.title,
    bookTitle: books.title
  }).from(examSessions).innerJoin(modules, (0, import_drizzle_orm8.eq)(examSessions.moduleId, modules.id)).innerJoin(books, (0, import_drizzle_orm8.eq)(modules.bookId, books.id)).where(
    (0, import_drizzle_orm8.and)(
      (0, import_drizzle_orm8.eq)(examSessions.userId, user.id),
      (0, import_drizzle_orm8.eq)(examSessions.status, "FINISHED"),
      (0, import_drizzle_orm8.eq)(examSessions.isPractice, false)
    )
  ).orderBy((0, import_drizzle_orm8.desc)(examSessions.finishedAt)).limit(50).all();
  res.json({
    sessions: rows.map((s) => ({
      id: s.id,
      moduleId: s.moduleId,
      scorePercent: s.scorePercent,
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      skippedCount: s.skippedCount,
      totalQuestions: s.totalQuestions,
      negativeMarking: s.negativeMarking,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      moduleTitle: s.moduleTitle,
      bookTitle: s.bookTitle
    }))
  });
});
examRouter.get("/exam/progress", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const progress = await getUserProgress(user.id, user.field);
  res.json({ progress });
});
examRouter.get("/exam/stats", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const sessions = await db.select({
    correctCount: examSessions.correctCount,
    wrongCount: examSessions.wrongCount,
    skippedCount: examSessions.skippedCount,
    totalQuestions: examSessions.totalQuestions,
    bookTitle: books.title
  }).from(examSessions).innerJoin(modules, (0, import_drizzle_orm8.eq)(examSessions.moduleId, modules.id)).innerJoin(books, (0, import_drizzle_orm8.eq)(modules.bookId, books.id)).where(
    (0, import_drizzle_orm8.and)(
      (0, import_drizzle_orm8.eq)(examSessions.userId, user.id),
      (0, import_drizzle_orm8.eq)(examSessions.status, "FINISHED"),
      (0, import_drizzle_orm8.eq)(examSessions.isPractice, false)
    )
  ).all();
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalSkipped = 0;
  let totalQuestions = 0;
  const byBook = /* @__PURE__ */ new Map();
  for (const s of sessions) {
    totalCorrect += s.correctCount;
    totalWrong += s.wrongCount;
    totalSkipped += s.skippedCount;
    totalQuestions += s.totalQuestions;
    const key = s.bookTitle;
    const entry = byBook.get(key) ?? { correct: 0, wrong: 0, skipped: 0 };
    entry.correct += s.correctCount;
    entry.wrong += s.wrongCount;
    entry.skipped += s.skippedCount;
    byBook.set(key, entry);
  }
  res.json({
    stats: {
      totalCorrect,
      totalWrong,
      totalSkipped,
      totalQuestions,
      totalSessions: sessions.length,
      byBook: Array.from(byBook.entries()).map(([book, v]) => ({
        book,
        ...v
      }))
    }
  });
});
examRouter.get("/exam/in-progress", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const session = await db.select({
    id: examSessions.id,
    moduleId: examSessions.moduleId,
    startedAt: examSessions.startedAt,
    durationSec: examSessions.durationSec,
    totalQuestions: examSessions.totalQuestions,
    moduleTitle: modules.title,
    bookTitle: books.title
  }).from(examSessions).innerJoin(modules, (0, import_drizzle_orm8.eq)(examSessions.moduleId, modules.id)).innerJoin(books, (0, import_drizzle_orm8.eq)(modules.bookId, books.id)).where((0, import_drizzle_orm8.and)((0, import_drizzle_orm8.eq)(examSessions.userId, user.id), (0, import_drizzle_orm8.eq)(examSessions.status, "IN_PROGRESS"))).orderBy((0, import_drizzle_orm8.desc)(examSessions.startedAt)).limit(1).get();
  if (!session) {
    res.json({ session: null });
    return;
  }
  res.json({
    session: {
      id: session.id,
      moduleId: session.moduleId,
      moduleTitle: session.moduleTitle,
      bookTitle: session.bookTitle,
      startedAt: session.startedAt.toISOString(),
      durationSec: session.durationSec,
      totalQuestions: session.totalQuestions
    }
  });
});
examRouter.get("/exam/leaderboard", async (req, res) => {
  const me = await getSession(req);
  if (!me) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const grouped = await db.select({
    userId: examSessions.userId,
    avgScore: (0, import_drizzle_orm8.avg)(examSessions.scorePercent),
    bestScore: (0, import_drizzle_orm8.max)(examSessions.scorePercent),
    n: (0, import_drizzle_orm8.count)()
  }).from(examSessions).where((0, import_drizzle_orm8.and)((0, import_drizzle_orm8.eq)(examSessions.status, "FINISHED"), (0, import_drizzle_orm8.eq)(examSessions.isPractice, false))).groupBy(examSessions.userId).all();
  const userRows = grouped.length > 0 ? await db.select({ id: users.id, name: users.name, username: users.username, field: users.field }).from(users).where(
    (0, import_drizzle_orm8.inArray)(
      users.id,
      grouped.map((g) => g.userId)
    )
  ).all() : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const ranked = grouped.map((g) => {
    const u = userById.get(g.userId);
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      field: u.field,
      avg: Math.round(Number(g.avgScore ?? 0)),
      best: g.bestScore ?? 0,
      count: g.n
    };
  }).filter((r) => r !== null).sort((a, b) => b.avg - a.avg || b.best - a.best);
  const top = ranked.slice(0, 50);
  const myRank = ranked.findIndex((r) => r.id === me.id) + 1;
  const myEntry = ranked.find((r) => r.id === me.id) ?? null;
  res.json({
    leaderboard: top.map((r, i) => ({ ...r, rank: i + 1 })),
    myRank: myRank || null,
    myStats: myEntry ? {
      avg: myEntry.avg,
      best: myEntry.best,
      count: myEntry.count
    } : null,
    totalStudents: ranked.length
  });
});
examRouter.get("/exam/:session", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const sessionId = req.params.session;
  const session = await db.query.examSessions.findFirst({
    where: (0, import_drizzle_orm8.eq)(examSessions.id, sessionId),
    with: { module: { with: { book: { columns: { title: true } } } } }
  });
  if (!session) {
    res.status(404).json({ error: "\u0646\u0634\u0633\u062A \u0622\u0632\u0645\u0648\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (session.userId !== user.id) {
    res.status(403).json({ error: "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632" });
    return;
  }
  const questionIds = JSON.parse(session.questionOrder);
  const questions2 = await getQuestionsForExam(session.moduleId, questionIds);
  const answerRows = await db.select({
    questionId: answers.questionId,
    selectedOption: answers.selectedOption,
    timeSpentMs: answers.timeSpentMs
  }).from(answers).where((0, import_drizzle_orm8.eq)(answers.sessionId, sessionId)).all();
  res.json({
    session: {
      id: session.id,
      moduleId: session.moduleId,
      moduleTitle: session.module.title,
      bookTitle: session.module.book.title,
      status: session.status,
      totalQuestions: session.totalQuestions,
      durationSec: session.durationSec,
      negativeMarking: session.negativeMarking,
      isPractice: session.isPractice,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() ?? null,
      scorePercent: session.scorePercent
    },
    questions: questions2,
    answers: Object.fromEntries(answerRows.map((a) => [a.questionId, a]))
  });
});
examRouter.post("/exam/:session/answer", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const sessionId = req.params.session;
  const data = parseBody(answerSchema, req.body, res);
  if (!data) return;
  const { questionId, selectedOption, timeSpentMs } = data;
  const result = await recordAnswer(
    sessionId,
    user.id,
    questionId,
    selectedOption,
    timeSpentMs
  );
  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === "QUESTION_NOT_FOUND") {
      res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    } else if (result.code === "INVALID_OPTION") {
      res.status(422).json({ error: "\u06AF\u0632\u06CC\u0646\u0647 \u0627\u0646\u062A\u062E\u0627\u0628\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A" });
    } else {
      res.status(403).json({ error: "\u0627\u06CC\u0646 \u0622\u0632\u0645\u0648\u0646 \u062F\u06CC\u06AF\u0631 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A" });
    }
    return;
  }
  res.json({ ok: true });
});
examRouter.post("/exam/:session/finish", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const sessionId = req.params.session;
  try {
    const result = await finishExam(sessionId, user.id);
    res.json({ result });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
      return;
    }
    res.status(500).json({ error: "\u062E\u0637\u0627 \u062F\u0631 \u067E\u0627\u06CC\u0627\u0646 \u0622\u0632\u0645\u0648\u0646" });
  }
});
examRouter.get("/exam/:session/review", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const sessionId = req.params.session;
  const session = await db.query.examSessions.findFirst({
    where: (0, import_drizzle_orm8.eq)(examSessions.id, sessionId),
    with: { module: { with: { book: { columns: { title: true } } } } }
  });
  if (!session) {
    res.status(404).json({ error: "\u0646\u0634\u0633\u062A \u0622\u0632\u0645\u0648\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (session.userId !== user.id) {
    res.status(403).json({ error: "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632" });
    return;
  }
  if (session.status !== "FINISHED") {
    res.status(403).json({ error: "\u0628\u0627\u0632\u0628\u06CC\u0646\u06CC \u0641\u0642\u0637 \u0628\u0631\u0627\u06CC \u0622\u0632\u0645\u0648\u0646\u200C\u0647\u0627\u06CC \u062A\u0645\u0627\u0645\u200C\u0634\u062F\u0647 \u0627\u0645\u06A9\u0627\u0646\u200C\u067E\u0630\u06CC\u0631 \u0627\u0633\u062A" });
    return;
  }
  const questionIds = JSON.parse(session.questionOrder);
  const questions2 = await getQuestionsForReview(session.moduleId, questionIds);
  const answerRows = await db.select({
    questionId: answers.questionId,
    selectedOption: answers.selectedOption,
    isCorrect: answers.isCorrect
  }).from(answers).where((0, import_drizzle_orm8.eq)(answers.sessionId, sessionId)).all();
  const answerMap = new Map(answerRows.map((a) => [a.questionId, a]));
  res.json({
    session: {
      id: session.id,
      moduleId: session.moduleId,
      moduleTitle: session.module.title,
      bookTitle: session.module.book.title,
      status: session.status,
      totalQuestions: session.totalQuestions,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      skippedCount: session.skippedCount,
      scorePercent: session.scorePercent,
      negativeMarking: session.negativeMarking,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() ?? null
    },
    questions: questions2,
    answers: Object.fromEntries(answerMap.entries())
  });
});
var checkSchema = import_zod2.z.object({
  questionId: import_zod2.z.string().min(1)
});
examRouter.post("/exam/:session/check", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const sessionId = req.params.session;
  const session = await db.select({
    id: examSessions.id,
    userId: examSessions.userId,
    status: examSessions.status,
    isPractice: examSessions.isPractice,
    moduleId: examSessions.moduleId
  }).from(examSessions).where((0, import_drizzle_orm8.eq)(examSessions.id, sessionId)).get();
  if (!session) {
    res.status(404).json({ error: "\u0646\u0634\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (session.userId !== user.id) {
    res.status(403).json({ error: "\u062F\u0633\u062A\u0631\u0633\u06CC \u063A\u06CC\u0631\u0645\u062C\u0627\u0632" });
    return;
  }
  if (!session.isPractice) {
    res.status(403).json({ error: "\u0641\u0642\u0637 \u062F\u0631 \u062D\u0627\u0644\u062A \u062A\u0645\u0631\u06CC\u0646 \u0642\u0627\u0628\u0644 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0633\u062A" });
    return;
  }
  if (session.status !== "IN_PROGRESS") {
    res.status(403).json({ error: "\u0627\u06CC\u0646 \u0622\u0632\u0645\u0648\u0646 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A" });
    return;
  }
  const data = parseBody(checkSchema, req.body, res);
  if (!data) return;
  const { questionId } = data;
  const q = await db.select({
    correctOption: questions.correctOption,
    explanation: questions.explanation,
    moduleId: questions.moduleId
  }).from(questions).where((0, import_drizzle_orm8.eq)(questions.id, questionId)).get();
  if (!q || q.moduleId !== session.moduleId) {
    res.status(404).json({ error: "\u0633\u0648\u0627\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  res.json({
    correctOption: q.correctOption,
    explanation: q.explanation
  });
});

// src/routes/user.routes.ts
var import_express3 = require("express");
var import_zod3 = require("zod");
var import_drizzle_orm9 = require("drizzle-orm");
var userRouter = (0, import_express3.Router)();
userRouter.put("/prefs", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(prefsSchema, req.body, res);
  if (!data) return;
  const dbUser = await db.select({ prefs: users.prefs }).from(users).where((0, import_drizzle_orm9.eq)(users.id, user.id)).get();
  if (!dbUser) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const current = JSON.parse(dbUser.prefs || "{}");
  const next = { ...current, ...data };
  await db.update(users).set({ prefs: JSON.stringify(next) }).where((0, import_drizzle_orm9.eq)(users.id, user.id)).run();
  res.json({ prefs: next });
});
var passwordChangeSchema = import_zod3.z.object({
  currentPassword: import_zod3.z.string().min(1, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06CC \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F"),
  newPassword: import_zod3.z.string().min(8, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062D\u062F\u0627\u0642\u0644 \u06F8 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F").max(72, "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F7\u06F2 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F").refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
    message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u0634\u0627\u0645\u0644 \u062D\u0631\u0641 \u0648 \u0639\u062F\u062F \u0628\u0627\u0634\u062F"
  })
});
userRouter.put("/password", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(passwordChangeSchema, req.body, res);
  if (!data) return;
  const { currentPassword, newPassword } = data;
  const dbUser = await db.select({ passwordHash: users.passwordHash }).from(users).where((0, import_drizzle_orm9.eq)(users.id, user.id)).get();
  if (!dbUser) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) {
    res.status(422).json({ error: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06CC \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A" });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(422).json({ error: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062C\u062F\u06CC\u062F \u0646\u0628\u0627\u06CC\u062F \u0628\u0627 \u0631\u0645\u0632 \u0641\u0639\u0644\u06CC \u06CC\u06A9\u0633\u0627\u0646 \u0628\u0627\u0634\u062F" });
    return;
  }
  const newHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newHash }).where((0, import_drizzle_orm9.eq)(users.id, user.id)).run();
  await db.update(refreshTokens).set({ revokedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(refreshTokens.userId, user.id), (0, import_drizzle_orm9.isNull)(refreshTokens.revokedAt))).run();
  await logout(req, res);
  res.json({ ok: true });
});
userRouter.get("/achievements", async (req, res) => {
  const me = await getSession(req);
  if (!me) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const sessions = await db.select({
    id: examSessions.id,
    scorePercent: examSessions.scorePercent,
    correctCount: examSessions.correctCount,
    wrongCount: examSessions.wrongCount,
    skippedCount: examSessions.skippedCount,
    totalQuestions: examSessions.totalQuestions,
    finishedAt: examSessions.finishedAt
  }).from(examSessions).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(examSessions.userId, me.id), (0, import_drizzle_orm9.eq)(examSessions.status, "FINISHED"))).all();
  const totalExams = sessions.length;
  const totalQuestions = sessions.reduce((a, s) => a + s.totalQuestions, 0);
  const totalCorrect = sessions.reduce((a, s) => a + s.correctCount, 0);
  const bestScore = sessions.reduce((a, s) => Math.max(a, s.scorePercent), 0);
  const perfectScores = sessions.filter((s) => s.scorePercent >= 90).length;
  const days = /* @__PURE__ */ new Set();
  for (const s of sessions) {
    if (s.finishedAt) {
      days.add(s.finishedAt.toISOString().slice(0, 10));
    }
  }
  let streak = 0;
  const today = /* @__PURE__ */ new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i > 0) break;
  }
  const achievements = [
    {
      id: "first_exam",
      title: "\u0627\u0648\u0644\u06CC\u0646 \u0642\u062F\u0645",
      description: "\u0627\u0648\u0644\u06CC\u0646 \u0622\u0632\u0645\u0648\u0646 \u062E\u0648\u062F \u0631\u0627 \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0628\u0631\u0633\u0627\u0646\u06CC\u062F",
      icon: "Footprints",
      unlocked: totalExams >= 1
    },
    {
      id: "streak_3",
      title: "\u067E\u0634\u062A\u200C\u0633\u0631\u0647\u0645",
      description: "\u06F3 \u0631\u0648\u0632 \u067E\u06CC\u0627\u067E\u06CC \u0622\u0632\u0645\u0648\u0646 \u0628\u062F\u0647\u06CC\u062F",
      icon: "Flame",
      unlocked: streak >= 3,
      progress: { current: streak, target: 3 }
    },
    {
      id: "streak_7",
      title: "\u0647\u0641\u062A\u0647\u200C\u06CC \u067E\u0631\u06A9\u0627\u0631",
      description: "\u06F7 \u0631\u0648\u0632 \u067E\u06CC\u0627\u067E\u06CC \u0622\u0632\u0645\u0648\u0646 \u0628\u062F\u0647\u06CC\u062F",
      icon: "Flame",
      unlocked: streak >= 7,
      progress: { current: streak, target: 7 }
    },
    {
      id: "exams_10",
      title: "\u062F\u0647\u200C\u062A\u0627\u06CC \u06A9\u0627\u0645\u0644",
      description: "\u06F1\u06F0 \u0622\u0632\u0645\u0648\u0646 \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0628\u0631\u0633\u0627\u0646\u06CC\u062F",
      icon: "Target",
      unlocked: totalExams >= 10,
      progress: { current: totalExams, target: 10 }
    },
    {
      id: "questions_100",
      title: "\u0635\u062F \u0633\u0648\u0627\u0644",
      description: "\u0628\u0647 \u06F1\u06F0\u06F0 \u0633\u0648\u0627\u0644 \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F",
      icon: "FileQuestion",
      unlocked: totalQuestions >= 100,
      progress: { current: totalQuestions, target: 100 }
    },
    {
      id: "perfect_score",
      title: "\u0646\u0645\u0631\u0647\u200C\u06CC \u0639\u0627\u0644\u06CC",
      description: "\u06CC\u06A9 \u0622\u0632\u0645\u0648\u0646 \u0628\u0627 \u062F\u0631\u0635\u062F \u06F9\u06F0+ \u0628\u0632\u0646\u06CC\u062F",
      icon: "Star",
      unlocked: perfectScores >= 1,
      progress: { current: perfectScores, target: 1 }
    },
    {
      id: "exams_50",
      title: "\u0646\u06CC\u0645\u200C\u062A\u0646\u0647",
      description: "\u06F5\u06F0 \u0622\u0632\u0645\u0648\u0646 \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0628\u0631\u0633\u0627\u0646\u06CC\u062F",
      icon: "Trophy",
      unlocked: totalExams >= 50,
      progress: { current: totalExams, target: 50 }
    },
    {
      id: "questions_500",
      title: "\u0627\u0633\u062A\u0627\u062F \u0633\u0648\u0627\u0644\u200C\u0647\u0627",
      description: "\u0628\u0647 \u06F5\u06F0\u06F0 \u0633\u0648\u0627\u0644 \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F",
      icon: "Brain",
      unlocked: totalQuestions >= 500,
      progress: { current: totalQuestions, target: 500 }
    }
  ];
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  res.json({
    achievements,
    stats: {
      totalExams,
      totalQuestions,
      totalCorrect,
      bestScore,
      streak,
      unlockedCount
    }
  });
});
userRouter.get("/daily-progress", async (req, res) => {
  const me = await getSession(req);
  if (!me) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const todayStart = /* @__PURE__ */ new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessionIds = await db.select({ id: examSessions.id }).from(examSessions).where((0, import_drizzle_orm9.eq)(examSessions.userId, me.id)).all();
  const answerRows = await db.select({ id: answers.id }).from(answers).where(
    (0, import_drizzle_orm9.and)(
      sessionIds.length > 0 ? (0, import_drizzle_orm9.inArray)(
        answers.sessionId,
        sessionIds.map((s) => s.id)
      ) : void 0,
      (0, import_drizzle_orm9.gte)(answers.answeredAt, todayStart)
    )
  ).all();
  res.json({
    todayAnswered: answerRows.length,
    date: todayStart.toISOString().slice(0, 10)
  });
});
userRouter.get("/heatmap", async (req, res) => {
  const me = await getSession(req);
  if (!me) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const range = req.query.range === "30" ? 30 : 7;
  const dayCount = range;
  const days = [];
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - (dayCount - 1));
  const since = new Date(firstDay);
  const countsByDay = /* @__PURE__ */ new Map();
  const mySessionIds = await db.select({ id: examSessions.id }).from(examSessions).where((0, import_drizzle_orm9.eq)(examSessions.userId, me.id)).all();
  const grouped = mySessionIds.length > 0 ? await db.select({ answeredAt: answers.answeredAt, n: (0, import_drizzle_orm9.count)() }).from(answers).where(
    (0, import_drizzle_orm9.and)(
      (0, import_drizzle_orm9.inArray)(
        answers.sessionId,
        mySessionIds.map((s) => s.id)
      ),
      (0, import_drizzle_orm9.gte)(answers.answeredAt, since)
    )
  ).groupBy(answers.answeredAt).all() : [];
  for (const row of grouped) {
    const d = new Date(row.answeredAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + row.n);
  }
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const count6 = countsByDay.get(d.toISOString().slice(0, 10)) ?? 0;
    days.push({
      date: d.toISOString().slice(0, 10),
      count: count6,
      label: new Intl.DateTimeFormat("fa-IR", { weekday: "short" }).format(d),
      dayNum: d.getDate()
    });
  }
  const max2 = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  res.json({ days, max: max2, total, activeDays, range: dayCount });
});

// src/routes/support.routes.ts
var import_express4 = require("express");
var import_zod4 = require("zod");
var import_drizzle_orm10 = require("drizzle-orm");

// src/lib/chat-socket.ts
var import_socket = require("socket.io");
var isStaff = (role) => role === "ADMIN" || role === "CONTENT_ADMIN";
var userRoom = (id2) => `user:${id2}`;
var ADMINS_ROOM = "admins";
var socketRates = /* @__PURE__ */ new WeakMap();
function consumeRate(socket) {
  const now = Date.now();
  const st = socketRates.get(socket) ?? { tokens: 10, last: now };
  st.tokens = Math.min(10, st.tokens + (now - st.last) / 1e3 * 1);
  st.last = now;
  if (st.tokens < 1) return false;
  st.tokens -= 1;
  socketRates.set(socket, st);
  return true;
}
var io = null;
function attachChatSocket(httpServer, allowedOrigins) {
  io = new import_socket.Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST"]
    },
    pingTimeout: 6e4,
    pingInterval: 25e3
  });
  io.on("connection", (socket) => {
    const cookieHeader = socket.request.headers["cookie"];
    const token = readCookieFromHeader(cookieHeader, "pb_access");
    if (!token) {
      socket.disconnect(true);
      return;
    }
    verifyAccessToken(token).then((payload) => {
      if (!payload) {
        socket.disconnect(true);
        return;
      }
      const user = { id: payload.sub, role: payload.role, name: payload.name };
      void socket.join(userRoom(user.id));
      if (isStaff(user.role)) void socket.join(ADMINS_ROOM);
      socket.on("chat:send", (raw) => {
        const p = raw ?? {};
        const targetUserId = typeof p.userId === "string" ? p.userId.trim() : "";
        const text2 = typeof p.text === "string" ? p.text : "";
        if (!targetUserId || !text2 || text2.length > 2e3) return;
        if (!consumeRate(socket)) {
          socket.emit("chat:error", { code: "RATE_LIMITED", message: "Too many messages" });
          return;
        }
        if (!isStaff(user.role) && targetUserId !== user.id) return;
        const message = {
          id: `live-${socket.id}-${Date.now()}`,
          userId: targetUserId,
          sender: isStaff(user.role) ? "ADMIN" : "STUDENT",
          text: text2,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        io.to(userRoom(targetUserId)).emit("chat:message", message);
        io.to(ADMINS_ROOM).emit("chat:message", message);
      });
      socket.on("chat:typing", (raw) => {
        const p = raw ?? {};
        let targetUserId = typeof p.userId === "string" ? p.userId.trim() : "";
        if (!targetUserId) return;
        if (!isStaff(user.role)) {
          targetUserId = user.id;
          io.to(ADMINS_ROOM).emit("chat:typing", { userId: targetUserId, sender: user.role });
          return;
        }
        io.to(userRoom(targetUserId)).emit("chat:typing", { userId: targetUserId, sender: user.role });
      });
      socket.on("chat:read", (raw) => {
        const p = raw ?? {};
        const targetUserId = typeof p.userId === "string" ? p.userId.trim() : "";
        if (!targetUserId || !isStaff(user.role)) return;
        io.to(userRoom(targetUserId)).emit("chat:read", { userId: targetUserId });
      });
    });
  });
}
function ioEmitChatMessage(msg) {
  io?.to(userRoom(msg.userId)).emit("chat:message", msg);
  io?.to(ADMINS_ROOM).emit("chat:message", msg);
}
function ioEmitChatRead(userId) {
  io?.to(userRoom(userId)).emit("chat:read", { userId });
}

// src/routes/support.routes.ts
var supportRouter = (0, import_express4.Router)();
var chatSendSchemaWithUser = import_zod4.z.object({
  text: import_zod4.z.string().trim().min(1).max(2e3),
  userId: import_zod4.z.string().optional()
});
supportRouter.get("/messages", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const isStaff2 = user.role === "ADMIN" || user.role === "CONTENT_ADMIN";
  const targetUserId = isStaff2 ? req.query.userId : user.id;
  if (!targetUserId) {
    res.status(403).json({ error: "userId \u0644\u0627\u0632\u0645 \u0627\u0633\u062A" });
    return;
  }
  const messages = await db.select({
    id: chatMessages.id,
    userId: chatMessages.userId,
    sender: chatMessages.sender,
    text: chatMessages.text,
    createdAt: chatMessages.createdAt,
    readAt: chatMessages.readAt
  }).from(chatMessages).where((0, import_drizzle_orm10.eq)(chatMessages.userId, targetUserId)).orderBy((0, import_drizzle_orm10.asc)(chatMessages.createdAt)).limit(200).all();
  res.json({ messages, userId: targetUserId });
});
supportRouter.post("/messages", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(chatSendSchemaWithUser, req.body, res);
  if (!data) return;
  const { text: text2, userId: bodyUserId } = data;
  const isStaff2 = user.role === "ADMIN" || user.role === "CONTENT_ADMIN";
  let targetUserId = user.id;
  if (isStaff2) {
    const q = bodyUserId ?? req.query.userId;
    if (!q) {
      res.status(400).json({ error: "\u0628\u0631\u0627\u06CC \u067E\u0627\u0633\u062E\u060C userId \u0644\u0627\u0632\u0645 \u0627\u0633\u062A" });
      return;
    }
    targetUserId = q;
    const exists = await db.select({ id: users.id }).from(users).where((0, import_drizzle_orm10.eq)(users.id, q)).get();
    if (!exists) {
      res.status(404).json({ error: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
      return;
    }
  }
  const msg = await db.insert(chatMessages).values({
    userId: targetUserId,
    sender: user.role === "ADMIN" || user.role === "CONTENT_ADMIN" ? "ADMIN" : "STUDENT",
    text: text2
  }).returning().get();
  ioEmitChatMessage({
    userId: targetUserId,
    sender: msg.sender,
    text: msg.text,
    createdAt: msg.createdAt.toISOString(),
    id: msg.id
  });
  res.status(201).json({ message: msg });
});
supportRouter.get("/conversations", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const userRows = await db.query.users.findMany({
    where: (0, import_drizzle_orm10.eq)(users.role, "STUDENT"),
    orderBy: (0, import_drizzle_orm10.desc)(users.createdAt),
    columns: { id: true, username: true, name: true, field: true },
    with: {
      chatMessages: {
        orderBy: (0, import_drizzle_orm10.desc)(chatMessages.createdAt),
        limit: 1,
        columns: { id: true, text: true, sender: true, createdAt: true, readAt: true }
      }
    }
  });
  const unreadCounts = await db.select({ userId: chatMessages.userId, n: (0, import_drizzle_orm10.count)() }).from(chatMessages).where((0, import_drizzle_orm10.and)((0, import_drizzle_orm10.eq)(chatMessages.sender, "STUDENT"), (0, import_drizzle_orm10.isNull)(chatMessages.readAt))).groupBy(chatMessages.userId).all();
  const unreadMap = new Map(unreadCounts.map((u) => [u.userId, u.n]));
  res.json({
    conversations: userRows.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      field: u.field,
      unread: unreadMap.get(u.id) ?? 0,
      lastMessage: u.chatMessages[0] ?? null
    }))
  });
});
supportRouter.post("/read", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const userId = req.query.userId;
  if (!userId) {
    res.status(400).json({ error: "userId \u0644\u0627\u0632\u0645 \u0627\u0633\u062A" });
    return;
  }
  await db.update(chatMessages).set({ readAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm10.and)((0, import_drizzle_orm10.eq)(chatMessages.userId, userId), (0, import_drizzle_orm10.eq)(chatMessages.sender, "STUDENT"), (0, import_drizzle_orm10.isNull)(chatMessages.readAt))).run();
  ioEmitChatRead(userId);
  res.json({ ok: true });
});

// src/routes/archive.routes.ts
var import_express5 = require("express");
var import_fs3 = require("fs");
var import_drizzle_orm11 = require("drizzle-orm");

// src/lib/archive-files.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_url2 = require("url");
var import_meta3 = {};
var here3 = typeof __dirname !== "undefined" ? __dirname : (0, import_path2.dirname)((0, import_url2.fileURLToPath)(import_meta3.url));
function findRepoRoot2() {
  let dir = here3;
  for (let i = 0; i < 6; i++) {
    if ((0, import_fs2.existsSync)((0, import_path2.resolve)(dir, "client"))) return dir;
    const up = (0, import_path2.dirname)(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}
var ARCHIVE_DIR = process.env.UPLOAD_DIR ?? (0, import_path2.resolve)(findRepoRoot2(), "uploads", "archive");
var ARCHIVE_KINDS = ["question", "answer"];
var ALLOWED_EXT = /* @__PURE__ */ new Set(["pdf", "png", "jpg", "jpeg", "webp", "zip"]);
var MAX_ARCHIVE_FILE_BYTES = 25 * 1024 * 1024;
function isArchiveKind(kind) {
  return ARCHIVE_KINDS.includes(kind);
}
function safeExt(filename) {
  const raw = (filename ?? "").toLowerCase();
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = raw.slice(dot + 1);
  return ALLOWED_EXT.has(ext) ? ext : null;
}
function extFromContentType(ct) {
  const map = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip"
  };
  const ext = map[(ct ?? "").split(";")[0].trim().toLowerCase()];
  return ext ?? null;
}
function saveArchiveUpload(archiveId, kind, buffer, filename, contentType) {
  if (!buffer || buffer.length === 0) throw new Error("\u0641\u0627\u06CC\u0644\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A");
  if (buffer.length > MAX_ARCHIVE_FILE_BYTES) throw new Error("\u062D\u062C\u0645 \u0641\u0627\u06CC\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A (\u062D\u062F\u0627\u06A9\u062B\u0631 \u06F2\u06F5 \u0645\u06AF\u0627\u0628\u0627\u06CC\u062A)");
  const ext = safeExt(filename) ?? extFromContentType(contentType);
  if (!ext) throw new Error("\u0641\u0631\u0645\u062A \u0641\u0627\u06CC\u0644 \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A (pdf\u060C png\u060C jpg\u060C webp\u060C zip)");
  (0, import_fs2.mkdirSync)(ARCHIVE_DIR, { recursive: true });
  const name = `${archiveId}-${kind}.${ext}`;
  (0, import_fs2.writeFileSync)((0, import_path2.resolve)(ARCHIVE_DIR, name), buffer);
  return name;
}
function deleteArchiveUploads(names) {
  for (const name of [names.questionPath, names.answerPath]) {
    if (!name) continue;
    try {
      (0, import_fs2.unlinkSync)((0, import_path2.resolve)(ARCHIVE_DIR, name));
    } catch {
    }
  }
}
function resolveStoredArchiveName(name) {
  if (!name || !/^[a-zA-Z0-9_-]+\.(pdf|png|jpg|jpeg|webp|zip)$/.test(name)) return null;
  return (0, import_path2.resolve)(ARCHIVE_DIR, name);
}

// src/routes/archive.routes.ts
var archiveRouter = (0, import_express5.Router)();
archiveRouter.get("/", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const files = await db.query.archiveFiles.findMany({
    where: (0, import_drizzle_orm11.eq)(archiveFiles.field, user.field),
    orderBy: [(0, import_drizzle_orm11.desc)(archiveFiles.year), (0, import_drizzle_orm11.desc)(archiveFiles.month)],
    with: { institution: { columns: { id: true, name: true } } }
  });
  const byInstitution = /* @__PURE__ */ new Map();
  const noInstitution = [];
  for (const f of files) {
    if (f.institution) {
      const key = f.institution.id;
      if (!byInstitution.has(key)) {
        byInstitution.set(key, {
          id: f.institution.id,
          name: f.institution.name,
          files: []
        });
      }
      byInstitution.get(key).files.push(f);
    } else {
      noInstitution.push(f);
    }
  }
  res.json({
    institutions: Array.from(byInstitution.values()),
    ungrouped: noInstitution
  });
});
archiveRouter.get("/file/:id/:kind", async (req, res) => {
  const user = await getSession(req);
  if (!user) {
    res.status(401).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F" });
    return;
  }
  const kind = String(req.params.kind);
  if (!isArchiveKind(kind)) {
    res.status(400).json({ error: "\u0646\u0648\u0639 \u0641\u0627\u06CC\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const record = await db.select().from(archiveFiles).where((0, import_drizzle_orm11.eq)(archiveFiles.id, req.params.id)).get();
  if (!record) {
    res.status(404).json({ error: "\u0641\u0627\u06CC\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (record.field !== user.field) {
    res.status(404).json({ error: "\u0641\u0627\u06CC\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const stored = resolveStoredArchiveName(kind === "question" ? record.questionPath : record.answerPath);
  if (!stored) {
    res.status(404).json({ error: "\u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0645\u0648\u0631\u062F \u0641\u0627\u06CC\u0644 \u0622\u067E\u0644\u0648\u062F\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F \u2014 \u0627\u0632 \u0644\u06CC\u0646\u06A9 \u062F\u0627\u0646\u0644\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F" });
    return;
  }
  let size = 0;
  try {
    size = (0, import_fs3.statSync)(stored).size;
  } catch {
    res.status(404).json({ error: "\u0641\u0627\u06CC\u0644 \u0631\u0648\u06CC \u0633\u0631\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (size > MAX_ARCHIVE_FILE_BYTES) {
    res.status(413).json({ error: "\u0641\u0627\u06CC\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A" });
    return;
  }
  const ext = stored.split(".").pop() ?? "bin";
  const downloadName = `${record.title}.${ext}`.replace(/[\r\n"/\\]/g, "_");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(size));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="archive-${record.id}-${kind}.${ext}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  );
  res.sendFile(stored);
});

// src/routes/admin.routes.ts
var import_express6 = require("express");
var import_zod5 = require("zod");
var import_crypto3 = require("crypto");
var import_express7 = __toESM(require("express"), 1);
var import_drizzle_orm12 = require("drizzle-orm");
var adminRouter = (0, import_express6.Router)();
adminRouter.get("/books", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const bookRows = await db.query.books.findMany({
    orderBy: [(0, import_drizzle_orm12.asc)(books.order), (0, import_drizzle_orm12.asc)(books.title)],
    with: {
      modules: {
        orderBy: (0, import_drizzle_orm12.asc)(modules.order),
        columns: { id: true, title: true, description: true, order: true }
      }
    }
  });
  const counts = bookRows.length > 0 ? await db.select({ moduleId: questions.moduleId, n: (0, import_drizzle_orm12.count)() }).from(questions).groupBy(questions.moduleId).all() : [];
  const countByModule = new Map(counts.map((c) => [c.moduleId, c.n]));
  res.json({
    books: bookRows.map((b) => ({
      ...b,
      modules: b.modules.map((m) => ({
        ...m,
        questionCount: countByModule.get(m.id) ?? 0
      }))
    }))
  });
});
adminRouter.post("/books", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(bookCreateSchema, req.body, res);
  if (!data) return;
  const { title, field, order } = data;
  const book = await db.insert(books).values({ title, field, order }).returning().get();
  res.status(201).json({ book });
});
adminRouter.put("/books/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const data = parseBody(bookUpdateSchema, req.body, res);
  if (!data) return;
  const exists = await db.select({ id: books.id }).from(books).where((0, import_drizzle_orm12.eq)(books.id, id2)).get();
  if (!exists) {
    res.status(404).json({ error: "\u06A9\u062A\u0627\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const book = await db.update(books).set(data).where((0, import_drizzle_orm12.eq)(books.id, id2)).returning().get();
  res.json({ book });
});
adminRouter.delete("/books/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const deleted = await db.delete(books).where((0, import_drizzle_orm12.eq)(books.id, id2)).returning({ id: books.id }).get();
  if (!deleted) {
    res.status(404).json({ error: "\u06A9\u062A\u0627\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  res.json({ ok: true });
});
adminRouter.post("/modules", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(moduleCreateSchema, req.body, res);
  if (!data) return;
  const { bookId, title, description, order } = data;
  const book = await db.select({ id: books.id }).from(books).where((0, import_drizzle_orm12.eq)(books.id, bookId)).get();
  if (!book) {
    res.status(404).json({ error: "\u06A9\u062A\u0627\u0628 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const mod = await db.insert(modules).values({ bookId, title, description, order }).returning().get();
  res.status(201).json({ module: mod });
});
adminRouter.put("/modules/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const data = parseBody(moduleUpdateSchema, req.body, res);
  if (!data) return;
  const exists = await db.select({ id: modules.id }).from(modules).where((0, import_drizzle_orm12.eq)(modules.id, id2)).get();
  if (!exists) {
    res.status(404).json({ error: "\u067E\u0648\u062F\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const mod = await db.update(modules).set(data).where((0, import_drizzle_orm12.eq)(modules.id, id2)).returning().get();
  res.json({ module: mod });
});
adminRouter.delete("/modules/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const deleted = await db.delete(modules).where((0, import_drizzle_orm12.eq)(modules.id, id2)).returning({ id: modules.id }).get();
  if (!deleted) {
    res.status(404).json({ error: "\u067E\u0648\u062F\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  res.json({ ok: true });
});
var bulkQuestionSchema = import_zod5.z.object({
  text: import_zod5.z.string().trim().min(1).max(2e3),
  options: import_zod5.z.array(import_zod5.z.string().trim().min(1).max(500)).min(2).max(6),
  correctOption: import_zod5.z.number().int().min(0).max(5),
  explanation: import_zod5.z.string().trim().max(1e3).optional()
});
var bulkImportSchema = import_zod5.z.object({
  moduleId: import_zod5.z.string().min(1),
  questions: import_zod5.z.array(bulkQuestionSchema).min(1).max(100)
});
adminRouter.get("/questions", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const moduleId = req.query.moduleId;
  if (!moduleId) {
    res.status(403).json({ error: "moduleId \u0644\u0627\u0632\u0645 \u0627\u0633\u062A" });
    return;
  }
  const qRows = await db.select({
    id: questions.id,
    text: questions.text,
    imageBase64: questions.imageBase64,
    options: questions.options,
    correctOption: questions.correctOption,
    explanation: questions.explanation,
    createdAt: questions.createdAt
  }).from(questions).where((0, import_drizzle_orm12.eq)(questions.moduleId, moduleId)).orderBy((0, import_drizzle_orm12.asc)(questions.createdAt)).all();
  res.json({
    questions: qRows.map((q) => ({
      ...q,
      options: JSON.parse(q.options),
      hasImage: !!q.imageBase64
    }))
  });
});
adminRouter.post("/questions", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(questionCreateSchema, req.body, res);
  if (!data) return;
  const { moduleId, text: text2, imageBase64, options, correctOption, explanation } = data;
  const mod = await db.select({ id: modules.id }).from(modules).where((0, import_drizzle_orm12.eq)(modules.id, moduleId)).get();
  if (!mod) {
    res.status(404).json({ error: "\u067E\u0648\u062F\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (correctOption >= options.length) {
    res.status(403).json({ error: "\u06AF\u0632\u06CC\u0646\u0647\u200C\u06CC \u0635\u062D\u06CC\u062D \u062E\u0627\u0631\u062C \u0627\u0632 \u0628\u0627\u0632\u0647 \u0627\u0633\u062A" });
    return;
  }
  const q = await db.insert(questions).values({
    moduleId,
    text: text2,
    imageBase64: imageBase64 ?? null,
    options: JSON.stringify(options),
    correctOption,
    explanation
  }).returning().get();
  res.status(201).json({ question: q });
});
adminRouter.post("/questions/bulk", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(bulkImportSchema, req.body, res);
  if (!data) return;
  const { moduleId, questions: incoming } = data;
  const mod = await db.select({ id: modules.id }).from(modules).where((0, import_drizzle_orm12.eq)(modules.id, moduleId)).get();
  if (!mod) {
    res.status(404).json({ error: "\u067E\u0648\u062F\u0645\u0627\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  for (const q of incoming) {
    if (q.correctOption >= q.options.length) {
      res.status(422).json({
        error: `\u06AF\u0632\u06CC\u0646\u0647\u200C\u06CC \u0635\u062D\u06CC\u062D \u0628\u0631\u0627\u06CC \u0633\u0648\u0627\u0644 \xAB${q.text.slice(0, 30)}\u2026\xBB \u062E\u0627\u0631\u062C \u0627\u0632 \u0628\u0627\u0632\u0647 \u0627\u0633\u062A`
      });
      return;
    }
  }
  const created = await db.insert(questions).values(
    incoming.map((q) => ({
      moduleId,
      text: q.text,
      options: JSON.stringify(q.options),
      correctOption: q.correctOption,
      explanation: q.explanation || null
    }))
  ).run();
  res.status(201).json({ count: created.changes });
});
adminRouter.get("/questions/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const { id: id2 } = req.params;
  const q = await db.select({
    id: questions.id,
    moduleId: questions.moduleId,
    text: questions.text,
    imageBase64: questions.imageBase64,
    options: questions.options,
    correctOption: questions.correctOption,
    explanation: questions.explanation,
    createdAt: questions.createdAt
  }).from(questions).where((0, import_drizzle_orm12.eq)(questions.id, id2)).get();
  if (!q) {
    res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  res.json({ question: { ...q, options: JSON.parse(q.options) } });
});
adminRouter.put("/questions/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const data = parseBody(questionUpdateSchema, req.body, res);
  if (!data) return;
  const exists = await db.select({ id: questions.id }).from(questions).where((0, import_drizzle_orm12.eq)(questions.id, id2)).get();
  if (!exists) {
    res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const updateData = {};
  if (data.text !== void 0) updateData.text = data.text;
  if (data.imageBase64 !== void 0) updateData.imageBase64 = data.imageBase64 ?? null;
  if (data.options !== void 0) updateData.options = JSON.stringify(data.options);
  if (data.correctOption !== void 0) updateData.correctOption = data.correctOption;
  if (data.explanation !== void 0) updateData.explanation = data.explanation;
  const q = await db.update(questions).set(updateData).where((0, import_drizzle_orm12.eq)(questions.id, id2)).returning().get();
  res.json({ question: q });
});
adminRouter.delete("/questions/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const deleted = await db.delete(questions).where((0, import_drizzle_orm12.eq)(questions.id, id2)).returning({ id: questions.id }).get();
  if (!deleted) {
    res.status(404).json({ error: "\u0633\u0648\u0627\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  res.json({ ok: true });
});
adminRouter.get("/archive", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const files = await db.query.archiveFiles.findMany({
    orderBy: [(0, import_drizzle_orm12.desc)(archiveFiles.year), (0, import_drizzle_orm12.desc)(archiveFiles.month)],
    with: { institution: { columns: { id: true, name: true } } }
  });
  res.json({ files });
});
adminRouter.post("/archive", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(archiveCreateSchema, req.body, res);
  if (!data) return;
  if (!data.fileUrl && !req.body?.uploadQuestion) {
    res.status(422).json({ error: "\u0644\u06CC\u0646\u06A9 \u062F\u0627\u0646\u0644\u0648\u062F \u0628\u062F\u0647\u06CC\u062F \u06CC\u0627 \u062F\u0631 \u062D\u0627\u0644\u062A \u0622\u067E\u0644\u0648\u062F\u060C \u0641\u0627\u06CC\u0644 \u0633\u0648\u0627\u0644\u0627\u062A \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F" });
    return;
  }
  const file = await db.insert(archiveFiles).values(data).returning().get();
  res.status(201).json({ file });
});
adminRouter.post(
  "/archive/:id/file/:kind",
  import_express7.default.raw({ type: "*/*", limit: "25mb" }),
  async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!await requireCsrf(user, req)) {
      res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
      return;
    }
    const { id: id2 } = req.params;
    const kind = String(req.params.kind);
    if (!isArchiveKind(kind)) {
      res.status(400).json({ error: "\u0646\u0648\u0639 \u0641\u0627\u06CC\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
      return;
    }
    const exists = await db.select({ id: archiveFiles.id }).from(archiveFiles).where((0, import_drizzle_orm12.eq)(archiveFiles.id, id2)).get();
    if (!exists) {
      res.status(404).json({ error: "\u0641\u0627\u06CC\u0644 \u0622\u0631\u0634\u06CC\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
      return;
    }
    try {
      let originalName = Array.isArray(req.headers["x-file-name"]) ? req.headers["x-file-name"][0] : req.headers["x-file-name"];
      try {
        if (originalName) originalName = decodeURIComponent(originalName);
      } catch {
      }
      const name = saveArchiveUpload(
        id2,
        kind,
        Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? ""),
        originalName,
        req.headers["content-type"]
      );
      const updated = await db.update(archiveFiles).set(kind === "question" ? { questionPath: name } : { answerPath: name }).where((0, import_drizzle_orm12.eq)(archiveFiles.id, id2)).returning().get();
      res.json({ file: updated });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : "\u0630\u062E\u06CC\u0631\u0647\u200C\u06CC \u0641\u0627\u06CC\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F"
      });
    }
  }
);
adminRouter.put("/archive/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const data = parseBody(archiveCreateSchema, req.body, res);
  if (!data) return;
  const exists = await db.select({ id: archiveFiles.id }).from(archiveFiles).where((0, import_drizzle_orm12.eq)(archiveFiles.id, id2)).get();
  if (!exists) {
    res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const file = await db.update(archiveFiles).set(data).where((0, import_drizzle_orm12.eq)(archiveFiles.id, id2)).returning().get();
  res.json({ file });
});
adminRouter.delete("/archive/:id", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const existing = await db.select().from(archiveFiles).where((0, import_drizzle_orm12.eq)(archiveFiles.id, id2)).get();
  if (!existing) {
    res.status(404).json({ error: "\u0641\u0627\u06CC\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  await db.delete(archiveFiles).where((0, import_drizzle_orm12.eq)(archiveFiles.id, id2)).run();
  deleteArchiveUploads(existing);
  res.json({ ok: true });
});
adminRouter.get("/config", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  const state = await getAppState();
  res.json({ state });
});
adminRouter.put("/config", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(remoteConfigUpdateSchema, req.body, res);
  if (!data) return;
  const state = await updateAppState(data);
  res.json({ state });
});
adminRouter.get("/stats", async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const usersCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(users).get()?.n ?? 0;
  const studentsCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(users).where((0, import_drizzle_orm12.eq)(users.role, "STUDENT")).get()?.n ?? 0;
  const booksCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(books).get()?.n ?? 0;
  const modulesCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(modules).get()?.n ?? 0;
  const questionsCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(questions).get()?.n ?? 0;
  const sessionsCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(examSessions).where((0, import_drizzle_orm12.eq)(examSessions.status, "FINISHED")).get()?.n ?? 0;
  const archiveCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(archiveFiles).get()?.n ?? 0;
  const unreadChats = db.select({ n: (0, import_drizzle_orm12.count)() }).from(chatMessages).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(chatMessages.sender, "STUDENT"), (0, import_drizzle_orm12.isNull)(chatMessages.readAt))).get()?.n ?? 0;
  res.json({
    stats: {
      usersCount,
      studentsCount,
      booksCount,
      modulesCount,
      questionsCount,
      sessionsCount,
      archiveCount,
      unreadChats
    }
  });
});
var institutionCreateSchema = import_zod5.z.object({
  name: import_zod5.z.string().trim().min(1).max(80),
  order: import_zod5.z.number().int().default(0)
});
var institutionUpdateSchema = import_zod5.z.object({
  name: import_zod5.z.string().trim().min(1).max(80).optional(),
  order: import_zod5.z.number().int().optional()
});
adminRouter.get("/institutions", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  const institutionRows = await db.query.institutions.findMany({
    orderBy: (0, import_drizzle_orm12.asc)(institutions.order),
    with: { files: { columns: { id: true } } }
  });
  res.json({
    institutions: institutionRows.map((i) => ({
      id: i.id,
      name: i.name,
      order: i.order,
      fileCount: i.files.length
    }))
  });
});
adminRouter.post("/institutions", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(institutionCreateSchema, req.body, res);
  if (!data) return;
  const institution = await db.insert(institutions).values(data).returning().get();
  res.status(201).json({ institution });
});
adminRouter.put("/institutions/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const data = parseBody(institutionUpdateSchema, req.body, res);
  if (!data) return;
  const exists = await db.select({ id: institutions.id }).from(institutions).where((0, import_drizzle_orm12.eq)(institutions.id, id2)).get();
  if (!exists) {
    res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  const institution = await db.update(institutions).set(data).where((0, import_drizzle_orm12.eq)(institutions.id, id2)).returning().get();
  res.json({ institution });
});
adminRouter.delete("/institutions/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const deleted = await db.delete(institutions).where((0, import_drizzle_orm12.eq)(institutions.id, id2)).returning({ id: institutions.id }).get();
  if (!deleted) {
    res.status(404).json({ error: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  res.json({ ok: true });
});
var userUpdateSchema = import_zod5.z.object({
  name: import_zod5.z.string().trim().min(2).max(40).optional(),
  field: import_zod5.z.enum(["FANI_HERFEI", "KARDANESH"]).optional(),
  role: import_zod5.z.enum(["STUDENT", "ADMIN", "CONTENT_ADMIN"]).optional()
});
adminRouter.get("/users", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  const userRows = await db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    field: users.field,
    role: users.role,
    totalTests: users.totalTests,
    createdAt: users.createdAt
  }).from(users).orderBy((0, import_drizzle_orm12.desc)(users.createdAt)).all();
  res.json({ users: userRows });
});
adminRouter.post("/users", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const data = parseBody(registerSchema, req.body, res);
  if (!data) return;
  const existing = await db.select({ id: users.id }).from(users).where((0, import_drizzle_orm12.eq)(users.username, data.username)).get();
  if (existing) {
    res.status(409).json({ error: "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A" });
    return;
  }
  const passwordHash = await hashPassword(data.password);
  const created = await db.insert(users).values({
    name: data.name,
    username: data.username,
    passwordHash,
    field: data.field,
    role: "STUDENT"
  }).returning({
    id: users.id,
    username: users.username,
    name: users.name,
    field: users.field,
    role: users.role,
    totalTests: users.totalTests,
    createdAt: users.createdAt
  }).get();
  res.status(201).json({ user: created });
});
adminRouter.put("/users/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const data = parseBody(userUpdateSchema, req.body, res);
  if (!data) return;
  const existing = await db.select().from(users).where((0, import_drizzle_orm12.eq)(users.id, id2)).get();
  if (!existing) {
    res.status(404).json({ error: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (existing.role === "ADMIN" && data.role === "STUDENT") {
    const adminCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(users).where((0, import_drizzle_orm12.eq)(users.role, "ADMIN")).get()?.n ?? 0;
    if (adminCount <= 1) {
      res.status(400).json({ error: "\u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646 \u062A\u0646\u0647\u0627 \u0645\u062F\u06CC\u0631 \u0631\u0627 \u0639\u0627\u062F\u06CC \u06A9\u0631\u062F" });
      return;
    }
  }
  const updated = await db.update(users).set(data).where((0, import_drizzle_orm12.eq)(users.id, id2)).returning({
    id: users.id,
    username: users.username,
    name: users.name,
    field: users.field,
    role: users.role,
    totalTests: users.totalTests,
    createdAt: users.createdAt
  }).get();
  res.json({ user: updated });
});
adminRouter.delete("/users/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const { id: id2 } = req.params;
  const me = await getSession(req);
  if (me?.id === id2) {
    res.status(403).json({ error: "\u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F\u062A\u0627\u0646 \u0631\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F" });
    return;
  }
  const existing = await db.select({ role: users.role }).from(users).where((0, import_drizzle_orm12.eq)(users.id, id2)).get();
  if (!existing) {
    res.status(404).json({ error: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F" });
    return;
  }
  if (existing.role === "ADMIN") {
    const adminCount = db.select({ n: (0, import_drizzle_orm12.count)() }).from(users).where((0, import_drizzle_orm12.eq)(users.role, "ADMIN")).get()?.n ?? 0;
    if (adminCount <= 1) {
      res.status(400).json({ error: "\u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646 \u062A\u0646\u0647\u0627 \u0645\u062F\u06CC\u0631 \u0631\u0627 \u062D\u0630\u0641 \u06A9\u0631\u062F" });
      return;
    }
  }
  await db.delete(users).where((0, import_drizzle_orm12.eq)(users.id, id2)).run();
  res.json({ ok: true });
});
adminRouter.get("/external-api", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  const state = await getAppState();
  res.json({
    enabled: state.externalApiEnabled,
    prefix: state.externalApiKeyPrefix
  });
});
adminRouter.post("/external-api/key", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  const apiKey = `pbx_${(0, import_crypto3.randomBytes)(32).toString("hex")}`;
  const prefix = apiKey.slice(0, 12) + "\u2026";
  await updateAppState({
    externalApiKeyHash: sha256(apiKey),
    externalApiKeyPrefix: prefix
  });
  res.status(201).json({ apiKey, prefix });
});
adminRouter.delete("/external-api/key", async (req, res) => {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  if (!await requireCsrf(user, req)) {
    res.status(403).json({ error: "\u062A\u0648\u06A9\u0646 \u0627\u0645\u0646\u06CC\u062A\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A" });
    return;
  }
  await updateAppState({ externalApiKeyHash: null, externalApiKeyPrefix: "" });
  res.json({ ok: true });
});

// src/routes/external.routes.ts
var import_express8 = require("express");
var import_crypto4 = require("crypto");
var import_drizzle_orm13 = require("drizzle-orm");
var externalRouter = (0, import_express8.Router)();
function keysEqual(aHex, bHex) {
  const a = Buffer.from(aHex, "utf8");
  const b = Buffer.from(bHex, "utf8");
  if (a.length !== b.length) return false;
  return (0, import_crypto4.timingSafeEqual)(a, b);
}
async function checkApiKey(req, res) {
  const headerKey = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"];
  const provided = (Array.isArray(headerKey) ? headerKey[0] : headerKey)?.trim() || (typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : Array.isArray(authHeader) ? authHeader[0]?.slice(7).trim() : "") || "";
  const row = await db.select({ externalApiKeyHash: remoteConfig.externalApiKeyHash }).from(remoteConfig).where((0, import_drizzle_orm13.eq)(remoteConfig.id, "singleton")).get();
  if (!row?.externalApiKeyHash) {
    res.status(503).json({
      ok: false,
      error: "\u0633\u0631\u0648\u06CC\u0633 \u062E\u0627\u0631\u062C\u06CC \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A",
      code: "EXTERNAL_DISABLED"
    });
    return false;
  }
  if (!provided || !keysEqual(sha256(provided), row.externalApiKeyHash)) {
    res.status(401).json({
      ok: false,
      error: "\u06A9\u0644\u06CC\u062F API \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
      code: "INVALID_API_KEY"
    });
    return false;
  }
  return true;
}
externalRouter.post("/external/verify", async (req, res) => {
  if (!await checkApiKey(req, res)) return;
  const parsed = externalVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      ok: false,
      error: parsed.error.issues[0]?.message ?? "\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
      code: "INVALID_INPUT"
    });
    return;
  }
  const ip = clientIp(req);
  const rlIp = rateLimit(`ext-verify-ip:${ip}`, 30, 300);
  const rlUser = rateLimit(`ext-verify-u:${ip}:${parsed.data.username}`, 8, 300);
  if (!rlIp.ok || !rlUser.ok) {
    res.status(429).json({
      ok: false,
      error: "\u062A\u0644\u0627\u0634\u200C\u0647\u0627\u06CC \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F",
      code: "RATE_LIMITED",
      retryAfterSec: Math.max(rlIp.retryAfterSec, rlUser.retryAfterSec)
    });
    return;
  }
  const { username, password, field } = parsed.data;
  const user = await db.select().from(users).where((0, import_drizzle_orm13.eq)(users.username, username)).get();
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    res.status(401).json({
      ok: false,
      error: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A",
      code: "INVALID_CREDENTIALS"
    });
    return;
  }
  if (field && user.field !== field) {
    res.status(401).json({
      ok: false,
      error: "\u0631\u0634\u062A\u0647 \u062A\u062D\u0635\u06CC\u0644\u06CC \u0628\u0627 \u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0645\u0637\u0627\u0628\u0642\u062A \u0646\u062F\u0627\u0631\u062F",
      code: "FIELD_MISMATCH",
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        field: user.field,
        role: user.role
      }
    });
    return;
  }
  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      field: user.field,
      role: user.role
    }
  });
});
externalRouter.post("/external/register", async (req, res) => {
  if (!await checkApiKey(req, res)) return;
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      ok: false,
      error: parsed.error.issues[0]?.message ?? "\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A",
      code: "INVALID_INPUT"
    });
    return;
  }
  const ip = clientIp(req);
  const rl = rateLimit(`ext-register:${ip}`, 10, 300);
  if (!rl.ok) {
    res.status(429).json({
      ok: false,
      error: "\u062A\u0644\u0627\u0634\u200C\u0647\u0627\u06CC \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F",
      code: "RATE_LIMITED",
      retryAfterSec: rl.retryAfterSec
    });
    return;
  }
  const { name, username, password, field } = parsed.data;
  const existing = await db.select({ id: users.id }).from(users).where((0, import_drizzle_orm13.eq)(users.username, username)).get();
  if (existing) {
    res.status(409).json({
      ok: false,
      error: "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A",
      code: "USERNAME_TAKEN"
    });
    return;
  }
  const created = await db.insert(users).values({ name, username, passwordHash: await hashPassword(password), field, role: "STUDENT" }).returning({ id: users.id, username: users.username, name: users.name, field: users.field, role: users.role }).get();
  res.status(201).json({ ok: true, user: created });
});

// src/app.ts
var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost,http://localhost,https://localhost").split(",").map((s) => s.trim()).filter(Boolean);
var TRUST_PROXY = process.env.TRUST_PROXY === "true";
function buildApp() {
  const app2 = (0, import_express9.default)();
  app2.disable("x-powered-by");
  app2.set("trust proxy", TRUST_PROXY ? 1 : false);
  app2.use((0, import_cookie_parser.default)());
  app2.use(
    (0, import_cors.default)({
      origin(origin, cb) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
        else cb(null, false);
      },
      credentials: true
    })
  );
  app2.use(import_express9.default.json({ limit: "3mb" }));
  app2.use((req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    if (req.path.startsWith("/api") || req.path === "/health") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
    }
    if (req.path.startsWith("/api") || req.path === "/health") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      );
    }
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader(
      "Cross-Origin-Resource-Policy",
      req.path.startsWith("/api") || req.path === "/health" ? "cross-origin" : "same-origin"
    );
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    next();
  });
  app2.get("/health", (_req, res) => res.json({ ok: true, service: "podman-ban-api" }));
  app2.use(async (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    const p = req.path;
    const exempt = p === "/health" || // Public, read-only, and required by the client to render the lock screen
    p === "/api/config" && req.method === "GET" || p.startsWith("/api/auth") || p.startsWith("/api/admin") || // Stateless credential check (API-key auth) — an auth flow like login.
    p.startsWith("/api/external");
    if (exempt) return next();
    try {
      const state = await getAppState();
      if (!state.siteLocked) return next();
      const user = await getSession(req);
      if (user && (user.role === "ADMIN" || user.role === "CONTENT_ADMIN")) return next();
      res.status(503).json({
        error: state.lockMessage || "\u0633\u0627\u06CC\u062A \u0645\u0648\u0642\u062A\u0627\u064B \u062F\u0631 \u062F\u0633\u062A \u062A\u0639\u0645\u06CC\u0631 \u0627\u0633\u062A",
        code: "SITE_LOCKED"
      });
    } catch {
      next();
    }
  });
  app2.use("/api", authRouter);
  app2.use("/api", examRouter);
  app2.use("/api/user", userRouter);
  app2.use("/api/support", supportRouter);
  app2.use("/api/archive", archiveRouter);
  app2.use("/api/admin", adminRouter);
  app2.use("/api", externalRouter);
  app2.use(
    (err, _req, res, _next) => {
      console.error("[api-error]", err instanceof Error ? err.message : err);
      if (res.headersSent) return;
      res.status(500).json({ error: "\u062E\u0637\u0627\u06CC \u062F\u0627\u062E\u0644\u06CC \u0633\u0631\u0648\u0631" });
    }
  );
  return app2;
}

// src/index.ts
var import_meta4 = {};
var PORT = Number(process.env.PORT ?? 3001);
var BIND_HOST = process.env.BIND_HOST || void 0;
var app = buildApp();
var ALLOWED_ORIGINS2 = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost,http://localhost,https://localhost").split(",").map((s) => s.trim()).filter(Boolean);
var here4 = typeof __dirname !== "undefined" ? __dirname : (0, import_path3.dirname)((0, import_url3.fileURLToPath)(import_meta4.url));
var clientDist = (0, import_path3.resolve)(here4, "..", "..", "client", "dist");
if (process.env.CLIENT_DIST === "1" || (0, import_fs4.existsSync)(clientDist)) {
  app.use(import_express10.default.static(clientDist, { index: false, dotfiles: "deny", maxAge: "1d" }));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    res.sendFile((0, import_path3.resolve)(clientDist, "index.html"));
  });
}
var done = () => {
  console.log(`[podman-ban-api] listening on ${BIND_HOST ?? "0.0.0.0"}:${PORT}`);
};
var server = BIND_HOST ? app.listen(PORT, BIND_HOST, done) : app.listen(PORT, done);
attachChatSocket(server, ALLOWED_ORIGINS2);
