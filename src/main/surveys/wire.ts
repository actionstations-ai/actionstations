// The seam between surveys and live play (spec 0422 FR-5, FR-7; protocol spec 0406).
//
// This module never touches a transport. The live-play work (0411, 0417, 0418) owns the
// session, the encrypted envelopes, targets and the player page; it calls these two pure
// functions and the store:
//
//   open:     const deliveryId = <new Base64Url22>
//             send('survey.open', { ...toWireSurvey(survey, deliveryId), targets, closesAt? })
//   response: const r = fromWireResponse(survey, payload, { deliveryId, responseId, channel })
//             if (r) await appendResponse(root, scenarioId, r)    // mirrors into the JSONL
//   close:    send('survey.close', { surveyId: deliveryId })
//
// `responseId` is chosen by the live module so that a second submission from the same seat in
// the same delivery replaces the first (readResponses keeps the last line per id). Nothing
// about the sender (client id, seat, display name, user agent) is passed in, so nothing about
// the sender can be stored. The IPC channels surveys:open-live / surveys:close-live and the
// survey-only session start option belong to that work as well.
import { z } from 'zod'
import { SafeId } from '@shared/schemas/common'
import type { Survey, SurveyChannel, SurveyResponse } from '@shared/schemas'
import {
  cleanAnswers,
  roundToMinute,
  scaleLabels,
  surveyQuestions,
  wireKind,
} from '@shared/survey-layout'
import { AppError } from '../lib/errors'

export const Base64Url22 = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

/** 0406 limits for survey.open. */
export const WIRE_LIMITS = { questions: 30, text: 500, option: 200, options: 12, intro: 2000 }

export const WireSurveyQuestion = z.object({
  id: SafeId,
  kind: z.enum(['scale', 'single', 'multi', 'text']),
  text: z.string().max(WIRE_LIMITS.text),
  options: z
    .array(z.object({ id: SafeId, label: z.string().max(WIRE_LIMITS.option) }))
    .max(WIRE_LIMITS.options)
    .optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  required: z.boolean(),
})

/** survey.open without `targets` and `closesAt`, which the live module adds. */
export const WireSurveyOpen = z.strictObject({
  surveyId: Base64Url22,
  title: z.string().max(200),
  intro: z.string().max(WIRE_LIMITS.intro).optional(),
  questions: z.array(WireSurveyQuestion).max(WIRE_LIMITS.questions),
  anonymous: z.literal(true),
})
export type WireSurveyOpen = z.infer<typeof WireSurveyOpen>

export const WireSurveyResponse = z.object({
  surveyId: Base64Url22,
  answers: z
    .array(
      z.object({
        questionId: SafeId,
        value: z.union([z.number(), z.string().max(4000), z.array(SafeId).max(12)]),
      }),
    )
    .max(WIRE_LIMITS.questions),
})

/** The wire has no labels for the ends of a scale, so they go into the question text. */
function withScaleEnds(q: Survey['sections'][number]['questions'][number], text: string): string {
  if (q.type !== 'rating' && q.type !== 'confidence') return text
  const { low, high } = scaleLabels(q)
  return low && high ? `${text} (1 = ${low}, 5 = ${high})` : text
}

const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text)

/**
 * The survey.open payload: question types mapped onto the wire kinds, and nothing a device
 * must not see (correct answers, citations, objective refs) included.
 */
export function toWireSurvey(survey: Survey, deliveryId: string): WireSurveyOpen {
  const placed = surveyQuestions(survey)
  if (placed.length > WIRE_LIMITS.questions)
    throw new AppError('VALIDATION', `Live play takes at most ${WIRE_LIMITS.questions} questions.`)
  const questions = placed.map(({ question: q }) => {
    const kind = wireKind(q)
    const text = withScaleEnds(q, q.type === 'confidence' && q.statement ? q.statement : q.text)
    return {
      id: q.id,
      kind,
      text: cut(text, WIRE_LIMITS.text),
      required: q.required,
      ...(kind === 'scale' ? { min: 1, max: 5 } : {}),
      ...(q.type === 'choice'
        ? { options: q.options.map((o) => ({ id: o.id, label: cut(o.text, WIRE_LIMITS.option) })) }
        : {}),
    }
  })
  return WireSurveyOpen.parse({
    surveyId: deliveryId,
    title: survey.title,
    ...(survey.introMd.trim() ? { intro: cut(survey.introMd, WIRE_LIMITS.intro) } : {}),
    questions,
    anonymous: true,
  })
}

export interface FromWireContext {
  deliveryId: string
  responseId: string
  channel: Extract<SurveyChannel, 'live' | 'qr'>
  receivedAt: string
}

/**
 * A stored response from a survey.response payload, or null when the payload is invalid or
 * for another delivery. Unknown question ids are ignored, scale values clamped to 1..5,
 * choices limited to the question's options and the time rounded to the minute.
 */
export function fromWireResponse(
  survey: Survey,
  payload: unknown,
  ctx: FromWireContext,
): SurveyResponse | null {
  const msg = WireSurveyResponse.safeParse(payload)
  if (!msg.success || msg.data.surveyId !== ctx.deliveryId) return null
  if (!SafeId.safeParse(ctx.responseId).success) return null
  const raw = Object.fromEntries(msg.data.answers.map((a) => [a.questionId, a.value]))
  const cleaned = cleanAnswers(survey, raw)
  if (!Object.keys(cleaned.answers).length) return null
  return {
    id: ctx.responseId,
    surveyId: survey.id,
    deliveryId: ctx.deliveryId,
    channel: ctx.channel,
    at: roundToMinute(ctx.receivedAt),
    answers: cleaned.answers,
    otherText: {},
  }
}
