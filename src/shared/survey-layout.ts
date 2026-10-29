// Pure survey helpers shared by main (store, summary, export, live seam) and the renderer
// (builder, preview, paper entry): question order, answer coercion, required-answer checks
// and the mapping onto the live protocol's question kinds (spec 0406 `survey.open`).
import type {
  Survey,
  SurveyAnswer,
  SurveyQuestion,
  SurveyQuestionType,
  SurveySection,
} from './schemas/survey'

export interface PlacedQuestion {
  question: SurveyQuestion
  section: SurveySection
  /** 1-based number across the whole survey, as printed on the form. */
  number: number
}

/** Every question in form order, numbered from 1. */
export function surveyQuestions(survey: Pick<Survey, 'sections'>): PlacedQuestion[] {
  let number = 0
  return survey.sections.flatMap((section) =>
    section.questions.map((question) => ({ question, section, number: ++number })),
  )
}

export function questionCount(survey: Pick<Survey, 'sections'>): number {
  return survey.sections.reduce((n, s) => n + s.questions.length, 0)
}

/** The live protocol's question kinds (0406). */
export type WireQuestionKind = 'scale' | 'single' | 'multi' | 'text'

export function wireKind(question: SurveyQuestion): WireQuestionKind {
  switch (question.type) {
    case 'rating':
    case 'confidence':
      return 'scale'
    case 'choice':
      return question.multiple ? 'multi' : 'single'
    case 'text':
      return 'text'
  }
}

/** What a participant reads for a question: confidence questions show their statement. */
export function questionPrompt(question: SurveyQuestion): string {
  if (question.type === 'confidence' && question.statement.trim()) return question.statement
  return question.text
}

/** Labels for the five points of a scale question. */
export function scaleLabels(question: SurveyQuestion): { low: string; high: string } {
  if (question.type === 'rating') return { low: question.lowLabel, high: question.highLabel }
  return { low: 'Not at all confident', high: 'Very confident' }
}

export const CONFIDENCE_POINT_LABELS = [
  'Not at all confident',
  'Slightly confident',
  'Somewhat confident',
  'Fairly confident',
  'Very confident',
] as const

export function pointLabels(question: SurveyQuestion): readonly string[] | undefined {
  if (question.type === 'confidence') return CONFIDENCE_POINT_LABELS
  if (question.type === 'rating') return question.pointLabels
  return undefined
}

/**
 * The stored form of one raw answer, or undefined when it is empty or not valid for the
 * question: scales are whole numbers clamped to 1..5, choices keep only the question's own
 * option ids (one for a single choice), text is trimmed and cut to the question's limit.
 */
export function coerceAnswer(question: SurveyQuestion, raw: unknown): SurveyAnswer | undefined {
  switch (question.type) {
    case 'rating':
    case 'confidence': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
      if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
      return Math.min(5, Math.max(1, Math.round(n)))
    }
    case 'choice': {
      const picked = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
      const valid = new Set(question.options.map((o) => o.id))
      const ids = [...new Set(picked.filter((p): p is string => typeof p === 'string'))].filter(
        (id) => valid.has(id),
      )
      const kept = question.multiple ? ids : ids.slice(0, 1)
      return kept.length ? kept : undefined
    }
    case 'text': {
      if (typeof raw !== 'string') return undefined
      const text = raw.trim().slice(0, question.maxLength)
      return text ? text : undefined
    }
  }
}

export interface CleanedAnswers {
  answers: Record<string, SurveyAnswer>
  otherText: Record<string, string>
}

/**
 * Keep only answers to questions in the survey, coerced; unknown question ids are dropped.
 * "Other" text is kept only for choice questions that allow it.
 */
export function cleanAnswers(
  survey: Pick<Survey, 'sections'>,
  answers: Record<string, unknown>,
  otherText: Record<string, unknown> = {},
): CleanedAnswers {
  const out: CleanedAnswers = { answers: {}, otherText: {} }
  for (const { question } of surveyQuestions(survey)) {
    const value = coerceAnswer(question, answers[question.id])
    if (value !== undefined) out.answers[question.id] = value
    const other = otherText[question.id]
    if (question.type === 'choice' && question.allowOther && typeof other === 'string') {
      const text = other.trim().slice(0, 500)
      if (text) out.otherText[question.id] = text
    }
  }
  return out
}

/** Required questions with no answer (an "Other" text counts as an answer). */
export function missingRequired(
  survey: Pick<Survey, 'sections'>,
  cleaned: CleanedAnswers,
): SurveyQuestion[] {
  return surveyQuestions(survey)
    .map((p) => p.question)
    .filter((q) => q.required && !(q.id in cleaned.answers) && !(q.id in cleaned.otherText))
}

/** "2026-10-28T14:37:52.120Z" → "2026-10-28T14:37:00.000Z" (responses keep the minute only). */
export function roundToMinute(iso: string): string {
  const t = new Date(iso)
  t.setUTCSeconds(0, 0)
  return t.toISOString()
}

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  rating: 'Rating (1–5)',
  choice: 'Multiple choice',
  text: 'Free text',
  confidence: 'Confidence (1–5)',
}
