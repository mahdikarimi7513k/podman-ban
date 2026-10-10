/**
 * User-preference resolution (exam duration default + daily goals).
 *
 * Saved via PUT /api/user/prefs as JSON (examDurationMin, dailyGoal,
 * studyGoalMin) and echoed back on the user object. The admin's
 * defaultTimerMin applies when the user never picked their own duration.
 * Hard fallbacks keep the exam startable even with corrupt prefs.
 */

export const FALLBACK_DURATION_MIN = 20

export const FALLBACK_DAILY_GOAL = 20

export const FALLBACK_STUDY_GOAL_MIN = 180

export interface ExamPrefs {
  examDurationMin?: number
  dailyGoal?: number
  studyGoalMin?: number
  repeatQuestions?: boolean
}

/** JSON shape we accept — fields validated one by one, never trusted. */
interface PrefsJson {
  examDurationMin?: unknown
  dailyGoal?: unknown
  studyGoalMin?: unknown
  repeatQuestions?: unknown
}

/** Parse the prefs JSON blob without ever throwing. */
export function parseExamPrefs(prefsJson: string | undefined | null): ExamPrefs {
  if (!prefsJson) return {}

  let raw: unknown

  try {
    raw = JSON.parse(prefsJson)
  } catch {
    return {}
  }

  if (raw === null || Array.isArray(raw)) return {}

  // SAFETY: JSON.parse returns unknown; each field is finiteness-checked below.
  const rec = raw as PrefsJson
  const out: ExamPrefs = {}

  if (Number.isFinite(rec.examDurationMin)) {
    // SAFETY: finiteness just passed, so this is a finite number.
    out.examDurationMin = rec.examDurationMin as number
  }

  if (Number.isFinite(rec.dailyGoal)) {
    // SAFETY: finiteness just passed, so this is a finite number.
    out.dailyGoal = rec.dailyGoal as number
  }

  if (Number.isFinite(rec.studyGoalMin)) {
    // SAFETY: finiteness just passed, so this is a finite number.
    out.studyGoalMin = rec.studyGoalMin as number
  }

  if (rec.repeatQuestions === true || rec.repeatQuestions === false) {
    out.repeatQuestions = rec.repeatQuestions
  }

  return out
}

function inRange(v: number | undefined, min: number, max: number): v is number {
  return v !== undefined && Number.isInteger(v) && v >= min && v <= max
}

/** Exam duration default: user pref → admin default → 20. */
export function resolveExamDurationMin(
  prefs: ExamPrefs,
  adminDefaultTimerMin: number | undefined,
): number {
  if (inRange(prefs.examDurationMin, 1, 180)) return prefs.examDurationMin

  if (inRange(adminDefaultTimerMin, 1, 180)) return adminDefaultTimerMin

  return FALLBACK_DURATION_MIN
}

/** Daily question goal: user pref → 20. */
export function resolveDailyGoal(prefs: ExamPrefs): number {
  if (inRange(prefs.dailyGoal, 5, 200)) return prefs.dailyGoal

  return FALLBACK_DAILY_GOAL
}

/** Daily study-minutes goal: user pref → admin default → 180. */
export function resolveStudyGoalMin(prefs: ExamPrefs, adminDefault?: number): number {
  if (inRange(prefs.studyGoalMin, 30, 960)) return prefs.studyGoalMin

  if (inRange(adminDefault, 30, 960)) return adminDefault

  return FALLBACK_STUDY_GOAL_MIN
}

/**
 * Hide-answered-modules + exclude-answered-questions switch.
 * Absent pref = ON (hide): matches the settings default and the server
 * startExam fallback.
 */
export function shouldHideRepeats(prefs: ExamPrefs): boolean {
  return prefs.repeatQuestions !== true
}
