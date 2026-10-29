/**
 * What a device knows about the surveys of a session (spec 0422 FR-5): the questions from
 * `survey.open`, this device's own answers, and whether the survey is still open. Pure helpers,
 * so the rules (who may answer, what is missing, what goes on the wire) are tested without a
 * browser. Nothing here names the participant: the survey is anonymous.
 */
import type { Opened } from '../../../shared/live/codec'
import type { SurveyOpenPayload } from '../../../shared/live/schemas'
import { seatDestinations, type SeatView } from '../../app/items'

export type SurveyQuestion = SurveyOpenPayload['questions'][number]
export type AnswerValue = number | string | string[]
export type Answers = Readonly<Record<string, AnswerValue>>

export interface PlayerSurvey {
  surveyId: string
  title: string
  intro?: string
  questions: SurveyQuestion[]
  targets: string[]
  closesAt?: number
  status: 'open' | 'closed'
  /** The answers this device sent (or queued), kept so it can show and change them. */
  mine?: Answers
  /** False while the answers wait in the outbox (offline). */
  sent: boolean
  openedAt: number
}

export type SurveyMap = Readonly<Record<string, PlayerSurvey>>

/** A seat in the survey's scope. Every kind of seat may answer when it is a target. */
export function mayAnswer(survey: Pick<PlayerSurvey, 'targets'>, seat: SeatView | undefined) {
  if (!seat) return false
  if (survey.targets.includes('all')) return true
  const mine = seatDestinations(seat)
  return survey.targets.some((t) => mine.has(t))
}

/** Apply a `survey.open`. A repeated id keeps this device's answers. */
export function applyOpen(
  surveys: SurveyMap,
  msg: Opened<'survey.open'>,
  at: number,
): { surveys: SurveyMap; isNew: boolean } {
  const p = msg.payload
  const before = surveys[p.surveyId]
  const next: PlayerSurvey = {
    surveyId: p.surveyId,
    title: p.title,
    ...(p.intro ? { intro: p.intro } : {}),
    questions: p.questions,
    targets: p.targets,
    ...(p.closesAt ? { closesAt: p.closesAt } : {}),
    status: 'open',
    ...(before?.mine ? { mine: before.mine } : {}),
    sent: before?.sent ?? true,
    openedAt: before?.openedAt ?? at,
  }
  return { surveys: { ...surveys, [p.surveyId]: next }, isNew: !before }
}

/** Apply a `survey.close`. A survey this device never heard of is ignored. */
export function applyClose(surveys: SurveyMap, msg: Opened<'survey.close'>): SurveyMap {
  const before = surveys[msg.payload.surveyId]
  if (!before) return surveys
  return { ...surveys, [before.surveyId]: { ...before, status: 'closed' } }
}

/** Open surveys first (newest first), then closed ones. */
export function orderedSurveys(surveys: SurveyMap): PlayerSurvey[] {
  const all = Object.values(surveys)
  const byNewest = (a: PlayerSurvey, b: PlayerSurvey) => b.openedAt - a.openedAt
  return [
    ...all.filter((s) => s.status === 'open').sort(byNewest),
    ...all.filter((s) => s.status === 'closed').sort(byNewest),
  ]
}

const hasValue = (v: AnswerValue | undefined): boolean =>
  v === undefined
    ? false
    : typeof v === 'string'
      ? v.trim() !== ''
      : Array.isArray(v)
        ? v.length > 0
        : true

/** Required questions with no answer yet, in survey order. */
export function missingAnswers(survey: PlayerSurvey, answers: Answers): SurveyQuestion[] {
  return survey.questions.filter((q) => q.required && !hasValue(answers[q.id]))
}

/** The answers to put on the wire: only questions of the survey, empty ones left out. */
export function wireAnswers(survey: PlayerSurvey, answers: Answers) {
  return survey.questions.flatMap((q) => {
    const raw = answers[q.id]
    if (!hasValue(raw)) return []
    const value = typeof raw === 'string' ? raw.trim().slice(0, 4000) : raw!
    return [{ questionId: q.id, value }]
  })
}

/** Labels for the points of a scale question: the survey gives the range, not the wording. */
export function scalePoints(q: SurveyQuestion): number[] {
  const min = q.min ?? 1
  const max = q.max ?? 5
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i)
}
