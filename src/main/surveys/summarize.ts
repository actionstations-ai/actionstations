// Survey results (#422, spec 0422 FR-8, FR-9): counts per channel, mean / median / 1..5
// distribution for scales, option counts and share correct for choices, shuffled free text,
// before/after confidence pairs and knowledge-check items. Pure and deterministic.
//
// Anonymity threshold: with fewer than `minResponses` responses the survey shows counts only;
// a question answered fewer than `minResponses` times shows its count only; a before/after
// mean is shown only when that side has at least `minResponses` answers. Free text is never
// in response order: it is shuffled with a seed from the survey and question ids, so it stays
// in the same order between views without revealing who wrote what when.
import type {
  ChoiceOption,
  Survey,
  SurveyAnswer,
  SurveyKnowledgeItem,
  SurveyPairSummary,
  SurveyQuestion,
  SurveyQuestionSummary,
  SurveyResponse,
  SurveySummary,
} from '@shared/schemas'
import { surveyQuestions } from '@shared/survey-layout'

export const DEFAULT_MIN_RESPONSES = 3

export interface SurveyWithResponses {
  survey: Survey
  responses: SurveyResponse[]
}

export interface SummarizeOptions {
  minResponses?: number
  /** The other edition of a before/after pair, with its responses. */
  pair?: SurveyWithResponses
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** FNV-1a: a small stable hash for the shuffle seed. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 PRNG. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates with a seeded generator: same seed and input, same order. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items].sort()
  const next = random(hash(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function mean(values: readonly number[]): number | undefined {
  if (!values.length) return undefined
  return round2(values.reduce((a, b) => a + b, 0) / values.length)
}

const scaleValues = (answers: SurveyAnswer[]): number[] =>
  answers.filter((a): a is number => typeof a === 'number' && a >= 1 && a <= 5)

function distribution(values: number[]): number[] {
  const counts = [0, 0, 0, 0, 0]
  for (const v of values) counts[v - 1]!++
  return counts
}

function answersFor(question: SurveyQuestion, responses: SurveyResponse[]): SurveyAnswer[] {
  return responses
    .map((r) => r.answers[question.id])
    .filter((a): a is SurveyAnswer => a !== undefined)
}

/** Picked option ids of a choice answer, limited to the question's options. */
function picked(answer: SurveyAnswer, options: ChoiceOption[]): string[] {
  const ids = Array.isArray(answer) ? answer : typeof answer === 'string' ? [answer] : []
  return ids.filter((id) => options.some((o) => o.id === id))
}

/** Correct when exactly the correct option was picked. */
function isCorrect(answer: SurveyAnswer, correctId: string, options: ChoiceOption[]): boolean {
  const ids = picked(answer, options)
  return ids.length === 1 && ids[0] === correctId
}

export function shareCorrect(
  question: SurveyQuestion,
  responses: SurveyResponse[],
): { share: number | undefined; n: number } {
  if (question.type !== 'choice' || !question.correctOptionId) return { share: undefined, n: 0 }
  const answers = answersFor(question, responses).filter(
    (a) => picked(a, question.options).length > 0,
  )
  if (!answers.length) return { share: undefined, n: 0 }
  const right = answers.filter((a) => isCorrect(a, question.correctOptionId!, question.options))
  return { share: round2(right.length / answers.length), n: answers.length }
}

function choiceDetail(
  question: Extract<SurveyQuestion, { type: 'choice' }>,
  responses: SurveyResponse[],
  seed: string,
): Partial<SurveyQuestionSummary> {
  const answers = answersFor(question, responses)
  const choices = question.options.map((o) => ({
    optionId: o.id,
    text: o.text,
    count: answers.filter((a) => picked(a, question.options).includes(o.id)).length,
    ...(question.correctOptionId ? { correct: o.id === question.correctOptionId } : {}),
  }))
  const others = responses.map((r) => r.otherText[question.id]).filter((t): t is string => !!t)
  const share = shareCorrect(question, responses).share
  return {
    choices,
    ...(others.length ? { otherTexts: seededShuffle(others, `${seed}:other`) } : {}),
    ...(share !== undefined ? { shareCorrect: share } : {}),
  }
}

function questionDetail(
  question: SurveyQuestion,
  responses: SurveyResponse[],
  seed: string,
): Partial<SurveyQuestionSummary> {
  switch (question.type) {
    case 'rating':
    case 'confidence': {
      const values = scaleValues(answersFor(question, responses))
      return { mean: mean(values)!, median: median(values)!, distribution: distribution(values) }
    }
    case 'choice':
      return choiceDetail(question, responses, seed)
    case 'text': {
      const texts = answersFor(question, responses).filter(
        (a): a is string => typeof a === 'string' && a.trim() !== '',
      )
      return { texts: seededShuffle(texts, seed) }
    }
  }
}

/** Responses that answered the question (an "Other" text counts). */
function answeredCount(question: SurveyQuestion, responses: SurveyResponse[]): number {
  return responses.filter((r) => r.answers[question.id] !== undefined || r.otherText[question.id])
    .length
}

function summarizeQuestion(
  survey: Survey,
  question: SurveyQuestion,
  responses: SurveyResponse[],
  minResponses: number,
  surveySuppressed: boolean,
): SurveyQuestionSummary {
  const n = answeredCount(question, responses)
  const suppressed = surveySuppressed || n < minResponses
  const citation =
    (question.type === 'choice' || question.type === 'confidence') && question.citation
      ? { citation: question.citation }
      : {}
  return {
    questionId: question.id,
    text: question.type === 'confidence' && question.statement ? question.statement : question.text,
    type: question.type,
    n,
    suppressed,
    ...citation,
    ...(suppressed ? {} : questionDetail(question, responses, `${survey.id}:${question.id}`)),
  }
}

function countBy(values: (string | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of values) if (v) out[v] = (out[v] ?? 0) + 1
  return out
}

/** The before and after sides of a pair (either may be missing). */
function editions(self: SurveyWithResponses, pair?: SurveyWithResponses) {
  const all = [self, ...(pair ? [pair] : [])]
  return {
    before: all.find((s) => s.survey.edition === 'before'),
    after: all.find((s) => s.survey.edition === 'after'),
  }
}

type ConfidenceQuestion = Extract<SurveyQuestion, { type: 'confidence' }>

const confidenceQuestions = (s?: SurveyWithResponses): ConfidenceQuestion[] =>
  s
    ? surveyQuestions(s.survey)
        .map((p) => p.question)
        .filter((q): q is ConfidenceQuestion => q.type === 'confidence')
    : []

/** Mean of one side, shown only at or above the threshold. */
function sideMean(
  questions: ConfidenceQuestion[],
  side: SurveyWithResponses | undefined,
  minResponses: number,
): { mean?: number; n: number } {
  if (!side || !questions.length) return { n: 0 }
  const values = questions.flatMap((q) => scaleValues(answersFor(q, side.responses)))
  // Several questions may share a pairKey; n counts responses, not answers.
  const n = side.responses.filter((r) =>
    questions.some((q) => r.answers[q.id] !== undefined),
  ).length
  return n >= minResponses ? { mean: mean(values)!, n } : { n }
}

export function summarizePairs(
  self: SurveyWithResponses,
  pair: SurveyWithResponses | undefined,
  minResponses: number,
): SurveyPairSummary[] {
  const { before, after } = editions(self, pair)
  const b = confidenceQuestions(before)
  const a = confidenceQuestions(after)
  const keys = [...new Set([...b, ...a].map((q) => q.pairKey))]
  return keys.map((pairKey) => {
    const qb = b.filter((q) => q.pairKey === pairKey)
    const qa = a.filter((q) => q.pairKey === pairKey)
    const ref = qa[0] ?? qb[0]!
    const sb = sideMean(qb, before, minResponses)
    const sa = sideMean(qa, after, minResponses)
    return {
      pairKey,
      statement: ref.statement || ref.text,
      ...(ref.objectiveRef ? { objectiveRef: ref.objectiveRef } : {}),
      ...(ref.capability ? { capability: ref.capability } : {}),
      ...(sb.mean !== undefined ? { before: sb.mean } : {}),
      ...(sa.mean !== undefined ? { after: sa.mean } : {}),
      ...(sb.mean !== undefined && sa.mean !== undefined
        ? { delta: round2(sa.mean - sb.mean) }
        : {}),
      nBefore: sb.n,
      nAfter: sa.n,
    }
  })
}

const keyedQuestions = (s?: SurveyWithResponses) =>
  s
    ? surveyQuestions(s.survey)
        .map((p) => p.question)
        .filter((q) => q.type === 'choice' && !!q.correctOptionId)
    : []

function sideShare(
  question: SurveyQuestion | undefined,
  side: SurveyWithResponses | undefined,
): { share: number | undefined; n: number } {
  if (!question || !side) return { share: undefined, n: 0 }
  return shareCorrect(question, side.responses)
}

/** Knowledge check: share correct per item before and after (same question ids). */
export function summarizeKnowledge(
  self: SurveyWithResponses,
  pair: SurveyWithResponses | undefined,
  minResponses: number,
): SurveyKnowledgeItem[] {
  const found = editions(self, pair)
  // A knowledge check without editions counts as one "after" side.
  const before = found.before
  const after = found.after ?? (before ? undefined : self)
  const qb = keyedQuestions(before)
  const qa = keyedQuestions(after)
  const ids = [...new Set([...qb, ...qa].map((q) => q.id))]
  return ids.map((questionId) => {
    const b = qb.find((q) => q.id === questionId)
    const a = qa.find((q) => q.id === questionId)
    const ref = (a ?? b)!
    const sb = sideShare(b, before)
    const sa = sideShare(a, after)
    const citation = ref.type === 'choice' && ref.citation ? { citation: ref.citation } : {}
    return {
      questionId,
      text: ref.text,
      ...(sb.share !== undefined && sb.n >= minResponses ? { shareBefore: sb.share } : {}),
      ...(sa.share !== undefined && sa.n >= minResponses ? { shareAfter: sa.share } : {}),
      nBefore: sb.n,
      nAfter: sa.n,
      ...citation,
    }
  })
}

/**
 * Summarize one survey. With `pair` (the other edition), confidence statements are compared
 * by pairKey and knowledge-check items by question id, both only in aggregate.
 */
export function summarizeSurvey(
  survey: Survey,
  responses: SurveyResponse[],
  opts: SummarizeOptions = {},
): SurveySummary {
  const minResponses = Math.max(1, opts.minResponses ?? DEFAULT_MIN_RESPONSES)
  const mine = responses.filter((r) => r.surveyId === survey.id)
  const suppressed = mine.length < minResponses
  const self = { survey, responses: mine }
  const hasKnowledge = keyedQuestions(self).length > 0 || keyedQuestions(opts.pair).length > 0
  return {
    surveyId: survey.id,
    title: survey.title,
    kind: survey.kind,
    ...(survey.edition ? { edition: survey.edition } : {}),
    responses: mine.length,
    byChannel: countBy(mine.map((r) => r.channel)),
    byRoleGroup: survey.askRoleGroup && !suppressed ? countBy(mine.map((r) => r.roleGroup)) : {},
    minResponses,
    questions: surveyQuestions(survey).map(({ question }) =>
      summarizeQuestion(survey, question, mine, minResponses, suppressed),
    ),
    pairs: summarizePairs(self, opts.pair, minResponses),
    knowledge: hasKnowledge ? summarizeKnowledge(self, opts.pair, minResponses) : [],
    suppressed,
  }
}
