/**
 * Drizzle schema — 1:1 translation of prisma/schema.prisma.
 *
 * Compatibility rules (dev.db keeps working untouched):
 *  - table + column names are EXACTLY the Prisma ones (PascalCase tables,
 *    camelCase columns) — Prisma never renamed them.
 *  - DateTime columns are ms-epoch integers (that's what Prisma 6 stores in
 *    SQLite), booleans are 0/1 integers. Same values, same queries.
 *  - ids default to randomUUID() (opaque unique strings like cuid was).
 */
import { randomUUID } from "node:crypto"
import { sqliteTable, text, integer, uniqueIndex, index, unique } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"

export const UserRole = { STUDENT: "STUDENT", ADMIN: "ADMIN", CONTENT_ADMIN: "CONTENT_ADMIN" } as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const StudyField = { FANI_HERFEI: "FANI_HERFEI", KARDANESH: "KARDANESH" } as const
export type StudyField = (typeof StudyField)[keyof typeof StudyField]

export const ExamStatus = { IN_PROGRESS: "IN_PROGRESS", FINISHED: "FINISHED", ABANDONED: "ABANDONED" } as const
export type ExamStatus = (typeof ExamStatus)[keyof typeof ExamStatus]

export const ChatSender = { STUDENT: "STUDENT", ADMIN: "ADMIN" } as const
export type ChatSender = (typeof ChatSender)[keyof typeof ChatSender]

const id = (name: string) =>
  text(name)
    .primaryKey()
    .$defaultFn(() => randomUUID())

const createdAt = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())

export const users = sqliteTable("User", {
  id: id("id"),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("passwordHash").notNull(),
  // Login email, normalized to lowercase at the validation boundary.
  // Nullable so pre-existing rows survive the migration; UNIQUE (SQLite
  // treats each NULL as distinct) plus an application pre-check reject
  // a second account on the same address.
  email: text("email").unique(),
  // OAuth provider subjects, set on first social login (or linked when a
  // verified provider email matches an existing account). UNIQUE so one
  // provider identity can never attach to two accounts.
  googleSub: text("googleSub").unique(),
  githubId: text("githubId").unique(),
  // Profile avatar as a small data URL (png/jpg/webp/gif, ≤500KB).
  // Nullable — initials fallback when empty. Shown in settings + study rooms.
  avatarBase64: text("avatarBase64"),
  field: text("field").notNull().$type<StudyField>(),
  role: text("role").notNull().default("STUDENT").$type<UserRole>(),
  prefs: text("prefs").notNull().default("{}"),
  totalTests: integer("totalTests").notNull().default(0),
  createdAt: createdAt("createdAt"),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
})

export const refreshTokens = sqliteTable("RefreshToken", {
  id: id("id"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("tokenHash").notNull().unique(),
  family: text("family").notNull(),
  userAgent: text("userAgent"),
  ip: text("ip"),
  createdAt: createdAt("createdAt"),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revokedAt", { mode: "timestamp_ms" }),
}, (t) => [index("RefreshToken_userId_idx").on(t.userId), index("RefreshToken_family_idx").on(t.family)])

// One-time OAuth handoff tickets (native-app return path) and pending
// social signups waiting for a study-field pick. ticketHash is sha256 of
// the random ticket; userId is null until the ticket is linked to an
// account, pendingProfile holds the verified provider profile JSON.
export const oauthTickets = sqliteTable("OauthTicket", {
  id: id("id"),
  ticketHash: text("ticketHash").notNull().unique(),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  pendingProfile: text("pendingProfile"),
  createdAt: createdAt("createdAt"),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("usedAt", { mode: "timestamp_ms" }),
}, (t) => [index("OauthTicket_userId_idx").on(t.userId)])

export const books = sqliteTable("Book", {
  id: id("id"),
  title: text("title").notNull(),
  field: text("field").$type<StudyField>(),
  order: integer("order").notNull().default(0),
  createdAt: createdAt("createdAt"),
}, (t) => [index("Book_field_idx").on(t.field)])

export const modules = sqliteTable("Module", {
  id: id("id"),
  bookId: text("bookId")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  createdAt: createdAt("createdAt"),
}, (t) => [index("Module_bookId_idx").on(t.bookId)])

export const questions = sqliteTable("Question", {
  id: id("id"),
  moduleId: text("moduleId")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  imageBase64: text("imageBase64"),
  options: text("options").notNull(),
  correctOption: integer("correctOption").notNull(),
  explanation: text("explanation"),
  // Optional explanation image (admin-set, rendered in the answer sheet
  // exactly like the question image).
  explanationImageBase64: text("explanationImageBase64"),
  createdAt: createdAt("createdAt"),
}, (t) => [index("Question_moduleId_idx").on(t.moduleId)])

export const examSessions = sqliteTable("ExamSession", {
  id: id("id"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  moduleId: text("moduleId")
    .notNull()
    .references(() => modules.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("IN_PROGRESS").$type<ExamStatus>(),
  startedAt: integer("startedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer("finishedAt", { mode: "timestamp_ms" }),
  // Set when the user exits mid-exam (pause): the wall clock stops here
  // and resume shifts startedAt forward by the away time, so re-entry
  // continues with the exact remaining time instead of bleeding it.
  // NULL while running. Finish/score logic ignores it.
  pausedAt: integer("pausedAt", { mode: "timestamp_ms" }),
  durationSec: integer("durationSec").notNull(),
  totalQuestions: integer("totalQuestions").notNull(),
  correctCount: integer("correctCount").notNull().default(0),
  wrongCount: integer("wrongCount").notNull().default(0),
  skippedCount: integer("skippedCount").notNull().default(0),
  scorePercent: integer("scorePercent").notNull().default(0),
  negativeMarking: integer("negativeMarking", { mode: "boolean" }).notNull().default(true),
  isPractice: integer("isPractice", { mode: "boolean" }).notNull().default(false),
  questionOrder: text("questionOrder").notNull(),
}, (t) => [index("ExamSession_userId_status_idx").on(t.userId, t.status), index("ExamSession_status_isPractice_idx").on(t.status, t.isPractice)])

export const answers = sqliteTable("Answer", {
  id: id("id"),
  sessionId: text("sessionId")
    .notNull()
    .references(() => examSessions.id, { onDelete: "cascade" }),
  questionId: text("questionId")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  selectedOption: integer("selectedOption"),
  isCorrect: integer("isCorrect", { mode: "boolean" }),
  timeSpentMs: integer("timeSpentMs").notNull().default(0),
  answeredAt: integer("answeredAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => [
  unique("Answer_sessionId_questionId_key").on(t.sessionId, t.questionId),
  index("Answer_sessionId_idx").on(t.sessionId),
  index("Answer_answeredAt_idx").on(t.answeredAt),
])

export const remoteConfig = sqliteTable("RemoteConfig", {
  id: text("id").primaryKey().default("singleton"),
  siteLocked: integer("siteLocked", { mode: "boolean" }).notNull().default(false),
  lockMessage: text("lockMessage").notNull().default(""),
  bannerText: text("bannerText").notNull().default(""),
  bannerLink: text("bannerLink").notNull().default(""),
  bannerActive: integer("bannerActive", { mode: "boolean" }).notNull().default(false),
  defaultTimerMin: integer("defaultTimerMin").notNull().default(20),
  negativeMarking: integer("negativeMarking", { mode: "boolean" }).notNull().default(true),
  registrationOpen: integer("registrationOpen", { mode: "boolean" }).notNull().default(true),
  registrationMessage: text("registrationMessage").notNull().default(""),
  dailyGoalNotify: integer("dailyGoalNotify", { mode: "boolean" }).notNull().default(true),
  // Konkur countdown target (ISO date string, admin-selectable). Null = hidden.
  konkurDate: text("konkurDate"),
  // Daily study goal in minutes for the study-room overview card.
  studyDailyGoalMin: integer("studyDailyGoalMin").notNull().default(180),
  externalApiKeyHash: text("externalApiKeyHash"),
  externalApiKeyPrefix: text("externalApiKeyPrefix").notNull().default(""),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
})

export const StudyRoomType = { COMPETITIVE: "COMPETITIVE", FRIENDLY: "FRIENDLY" } as const
export type StudyRoomType = (typeof StudyRoomType)[keyof typeof StudyRoomType]

export const StudySessionStatus = { ACTIVE: "ACTIVE", PAUSED: "PAUSED", ENDED: "ENDED" } as const
export type StudySessionStatus = (typeof StudySessionStatus)[keyof typeof StudySessionStatus]

// Study rooms (اتاق مطالعه): small group focus rooms, max 30 members.
export const studyRooms = sqliteTable("StudyRoom", {
  id: id("id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("COMPETITIVE").$type<StudyRoomType>(),
  capacity: integer("capacity").notNull().default(20),
  // 6-digit invite code, unique. Required when requireInvite is true.
  inviteCode: text("inviteCode").notNull().unique(),
  requireInvite: integer("requireInvite", { mode: "boolean" }).notNull().default(true),
  ownerId: text("ownerId").references(() => users.id, { onDelete: "set null" }),
  // Daily challenge set by an admin (title + minutes goal for one day).
  challengeTitle: text("challengeTitle"),
  challengeGoalMin: integer("challengeGoalMin"),
  challengeDate: text("challengeDate"),
  createdAt: createdAt("createdAt"),
}, (t) => [index("StudyRoom_createdAt_idx").on(t.createdAt)])

export const studyMembers = sqliteTable("StudyMember", {
  id: id("id"),
  roomId: text("roomId")
    .notNull()
    .references(() => studyRooms.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: integer("joinedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => [
  unique("StudyMember_roomId_userId_key").on(t.roomId, t.userId),
  index("StudyMember_roomId_idx").on(t.roomId),
  index("StudyMember_userId_idx").on(t.userId),
])

// Server-authoritative focus sessions: wall-clock survives background/kill.
export const studySessions = sqliteTable("StudySession", {
  id: id("id"),
  roomId: text("roomId")
    .notNull()
    .references(() => studyRooms.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("ACTIVE").$type<StudySessionStatus>(),
  startedAt: integer("startedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  // Accumulated active ms before the current active stretch (pause/resume).
  accumulatedMs: integer("accumulatedMs").notNull().default(0),
  // Set while PAUSED: wall clock stops here, resume shifts forward.
  pausedAt: integer("pausedAt", { mode: "timestamp_ms" }),
  endedAt: integer("endedAt", { mode: "timestamp_ms" }),
  subject: text("subject"),
}, (t) => [
  index("StudySession_roomId_status_idx").on(t.roomId, t.status),
  index("StudySession_userId_startedAt_idx").on(t.userId, t.startedAt),
])

export const chatMessages = sqliteTable("ChatMessage", {
  id: id("id"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sender: text("sender").notNull().$type<ChatSender>(),
  text: text("text").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  readAt: integer("readAt", { mode: "timestamp_ms" }),
}, (t) => [index("ChatMessage_userId_createdAt_idx").on(t.userId, t.createdAt)])

export const institutions = sqliteTable("Institution", {
  id: id("id"),
  name: text("name").notNull().unique(),
  order: integer("order").notNull().default(0),
  createdAt: createdAt("createdAt"),
})

// Admin-broadcast announcements. The client polls the latest active row on
// boot and surfaces it as an in-app toast (+ native local notification in
// the APK). Title/body are rendered as plain text only — never HTML.
export const notifications = sqliteTable("Notification", {
  id: id("id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt("createdAt"),
}, (t) => [index("Notification_createdAt_idx").on(t.createdAt)])

export const archiveFiles = sqliteTable("ArchiveFile", {
  id: id("id"),
  title: text("title").notNull(),
  field: text("field").notNull().$type<StudyField>(),
  year: integer("year").notNull(),
  month: integer("month"),
  fileUrl: text("fileUrl"),
  answerUrl: text("answerUrl"),
  questionPath: text("questionPath"),
  answerPath: text("answerPath"),
  institutionId: text("institutionId").references(() => institutions.id, { onDelete: "set null" }),
  createdAt: createdAt("createdAt"),
}, (t) => [index("ArchiveFile_field_year_idx").on(t.field, t.year), index("ArchiveFile_institutionId_idx").on(t.institutionId)])

// ---- relations (for db.query cross-table `with`) ----

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  oauthTickets: many(oauthTickets),
  examSessions: many(examSessions),
  chatMessages: many(chatMessages),
  notifications: many(notifications),
  studyMembers: many(studyMembers),
  studySessions: many(studySessions),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

export const oauthTicketsRelations = relations(oauthTickets, ({ one }) => ({
  user: one(users, { fields: [oauthTickets.userId], references: [users.id] }),
}))

// Short-lived OAuth start records (authorization-code + PKCE handshake).
// The code_verifier must live server-side: the native app opens the
// provider in the system browser (a different cookie jar), so cookies
// cannot carry it. Rows expire in 10 minutes and are deleted on use.
export const oauthStates = sqliteTable("OauthState", {
  id: id("id"),
  stateHash: text("stateHash").notNull().unique(),
  verifier: text("verifier").notNull(),
  mode: text("mode").notNull().$type<"web" | "native">(),
  createdAt: createdAt("createdAt"),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
})

export const booksRelations = relations(books, ({ many }) => ({
  modules: many(modules),
}))

export const modulesRelations = relations(modules, ({ one, many }) => ({
  book: one(books, { fields: [modules.bookId], references: [books.id] }),
  questions: many(questions),
  examSessions: many(examSessions),
}))

export const questionsRelations = relations(questions, ({ one, many }) => ({
  module: one(modules, { fields: [questions.moduleId], references: [modules.id] }),
  answers: many(answers),
}))

export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
  user: one(users, { fields: [examSessions.userId], references: [users.id] }),
  module: one(modules, { fields: [examSessions.moduleId], references: [modules.id] }),
  answers: many(answers),
}))

export const answersRelations = relations(answers, ({ one }) => ({
  session: one(examSessions, { fields: [answers.sessionId], references: [examSessions.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}))

export const institutionsRelations = relations(institutions, ({ many }) => ({
  files: many(archiveFiles),
}))

export const archiveFilesRelations = relations(archiveFiles, ({ one }) => ({
  institution: one(institutions, { fields: [archiveFiles.institutionId], references: [institutions.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  author: one(users, { fields: [notifications.createdBy], references: [users.id] }),
}))

export const studyRoomsRelations = relations(studyRooms, ({ one, many }) => ({
  owner: one(users, { fields: [studyRooms.ownerId], references: [users.id] }),
  members: many(studyMembers),
  sessions: many(studySessions),
}))

export const studyMembersRelations = relations(studyMembers, ({ one }) => ({
  room: one(studyRooms, { fields: [studyMembers.roomId], references: [studyRooms.id] }),
  user: one(users, { fields: [studyMembers.userId], references: [users.id] }),
}))

export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  room: one(studyRooms, { fields: [studySessions.roomId], references: [studyRooms.id] }),
  user: one(users, { fields: [studySessions.userId], references: [users.id] }),
}))
