// Surveys in a player language (#501, spec 0435): which words of a survey are translated, how
// they are put back, and where a translation is stored (inside the survey file, next to the
// English). Only words move: question ids, option ids, scales and correct answers stay as
// written, so responses and results from either language count together.
import { createHash } from 'node:crypto'
import {
  isStaffSurvey,
  type Survey,
  type SurveyQuestion,
  type SupportedLanguage,
  type TranslationStatus,
} from '@shared/schemas'
import { surveyQuestions } from '@shared/survey-layout'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { listSurveys, readSurvey, writeSurvey } from '../surveys/store'

type Texts = Record<string, string>

const put = (out: Texts, key: string, value: string | undefined): void => {
  if (value?.trim()) out[key] = value
}

function questionTexts(q: SurveyQuestion, out: Texts): void {
  put(out, `q:${q.id}:text`, q.text)
  put(out, `q:${q.id}:help`, q.help)
  if (q.type === 'confidence') put(out, `q:${q.id}:statement`, q.statement)
  if (q.type === 'rating') {
    put(out, `q:${q.id}:low`, q.lowLabel)
    put(out, `q:${q.id}:high`, q.highLabel)
    q.pointLabels?.forEach((label, i) => put(out, `q:${q.id}:point:${i}`, label))
  }
  if (q.type === 'choice') for (const o of q.options) put(out, `o:${q.id}:${o.id}`, o.text)
}

/** The human words of a survey, keyed by position (empty strings left out). */
export function surveyTexts(survey: Survey): Texts {
  const out: Texts = {}
  put(out, 'title', survey.title)
  put(out, 'intro', survey.introMd)
  for (const s of survey.sections) {
    put(out, `s:${s.id}:title`, s.title)
    put(out, `s:${s.id}:intro`, s.introMd)
    for (const q of s.questions) questionTexts(q, out)
  }
  return out
}

const PART_NAMES: Record<string, string> = {
  text: 'question',
  help: 'help line',
  statement: 'statement',
  low: 'low end of the scale',
  high: 'high end of the scale',
  title: 'title',
  intro: 'introduction',
}

/** A readable name for each key of `surveyTexts`, for the review screen. */
export function surveyLabels(survey: Survey): Record<string, string> {
  const out: Record<string, string> = { intro: 'Introduction' }
  survey.sections.forEach((s, si) => {
    out[`s:${s.id}:title`] = `Section ${si + 1}: title`
    out[`s:${s.id}:intro`] = `Section ${si + 1}: introduction`
  })
  surveyQuestions(survey).forEach(({ question: q, number }) => {
    const keys: Texts = {}
    questionTexts(q, keys)
    for (const key of Object.keys(keys)) {
      const [kind, , part, index] = key.split(':')
      const optionNo = q.type === 'choice' ? q.options.findIndex((o) => o.id === part) + 1 : 0
      const what =
        kind === 'o'
          ? `answer ${optionNo}`
          : part === 'point'
            ? `scale point ${Number(index) + 1}`
            : (PART_NAMES[part ?? ''] ?? part)
      out[key] = `Question ${number}: ${what}`
    }
  })
  return out
}

export const surveySourceHash = (survey: Survey): string =>
  createHash('sha256')
    .update(JSON.stringify(surveyTexts(survey)))
    .digest('hex')

function applyQuestion(q: SurveyQuestion, t: Texts): SurveyQuestion {
  const text = t[`q:${q.id}:text`] ?? q.text
  const help = t[`q:${q.id}:help`] ?? q.help
  switch (q.type) {
    case 'confidence':
      return { ...q, text, help, statement: t[`q:${q.id}:statement`] ?? q.statement }
    case 'rating': {
      const points = q.pointLabels?.map((l, i) => t[`q:${q.id}:point:${i}`] ?? l)
      return {
        ...q,
        text,
        help,
        lowLabel: t[`q:${q.id}:low`] ?? q.lowLabel,
        highLabel: t[`q:${q.id}:high`] ?? q.highLabel,
        ...(points ? { pointLabels: points } : {}),
      }
    }
    case 'choice':
      return {
        ...q,
        text,
        help,
        options: q.options.map((o) => ({ ...o, text: t[`o:${q.id}:${o.id}`] ?? o.text })),
      }
    default:
      return { ...q, text, help }
  }
}

/** The survey with `t` over its English words; positions without a translation stay English. */
export function applySurveyTexts(survey: Survey, t: Texts): Survey {
  return {
    ...survey,
    title: t.title ?? survey.title,
    introMd: t.intro ?? survey.introMd,
    sections: survey.sections.map((s) => ({
      ...s,
      title: t[`s:${s.id}:title`] ?? s.title,
      introMd: t[`s:${s.id}:intro`] ?? s.introMd,
      questions: s.questions.map((q) => applyQuestion(q, t)),
    })),
  }
}

/** The stored translation applied, or the English survey when it has none. */
export function translatedSurvey(survey: Survey, lang: SupportedLanguage): Survey {
  const stored = survey.translations?.[lang]
  return stored ? applySurveyTexts(survey, stored.text) : survey
}

/** Participant surveys a translation covers: not debriefs, not archived. */
export async function surveysInScope(root: string, scenarioId: string): Promise<Survey[]> {
  return (await listSurveys(root, scenarioId)).filter(
    (s) => !isStaffSurvey(s.kind) && s.status !== 'archived',
  )
}

/** Keep the reply to positions the survey has, as trimmed non-empty strings. */
export function cleanTexts(survey: Survey, reply: Record<string, unknown>): Texts {
  const allowed = surveyTexts(survey)
  const out: Texts = {}
  for (const [key, value] of Object.entries(reply))
    if (key in allowed && typeof value === 'string' && value.trim()) out[key] = value.trim()
  return out
}

/** Store a translation (machine output or a person's edit) against the current English. */
export async function saveSurveyTranslation(
  root: string,
  scenarioId: string,
  surveyId: string,
  lang: SupportedLanguage,
  text: Record<string, unknown>,
  status: TranslationStatus,
): Promise<void> {
  const survey = await readSurvey(root, scenarioId, surveyId)
  const clean = cleanTexts(survey, text)
  if (!Object.keys(clean).length) throw new AppError('VALIDATION', 'No translated text to save')
  const entry = { text: clean, sourceHash: surveySourceHash(survey), status, updatedAt: nowIso() }
  await writeSurvey(root, scenarioId, {
    ...survey,
    translations: { ...(survey.translations ?? {}), [lang]: entry },
  })
}
