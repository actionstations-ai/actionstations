// Survey results for one survey (results view, PDF summary) and for a whole scenario (the
// exercise record the AAR/IP draft reads, #419). Both go through summarizeSurvey().
import type { Survey, SurveySummary } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { getSettings } from '../settings/store'
import { listSurveys, readResponses } from './store'
import { summarizeSurvey, type SurveyWithResponses } from './summarize'

/** The anonymity threshold from the app settings (default 3). */
export async function minResponsesSetting(): Promise<number> {
  return (await getSettings()).surveys.minResponses
}

/** Evidence ref for one survey question in the AAR (spec 0419 EvidenceRef `survey:…`). */
export const surveyEvidenceRef = (surveyId: string, questionId?: string): string =>
  questionId ? `survey:${surveyId}:${questionId}` : `survey:${surveyId}`

/** A survey's linked other edition, when it still exists and links back. */
export function pairOf(survey: Survey, all: Survey[]): Survey | undefined {
  if (!survey.pairId) return undefined
  const pair = all.find((s) => s.id === survey.pairId)
  return pair?.pairId === survey.id ? pair : undefined
}

async function withResponses(
  root: string,
  scenarioId: string,
  survey: Survey,
): Promise<SurveyWithResponses> {
  return { survey, responses: await readResponses(root, scenarioId, survey.id) }
}

/** The summary of one survey, compared with its other edition when it has one. */
export async function surveySummary(
  root: string,
  scenarioId: string,
  surveyId: string,
  minResponses: number,
): Promise<SurveySummary> {
  const all = await listSurveys(root, scenarioId)
  const survey = all.find((s) => s.id === surveyId)
  if (!survey) throw new AppError('NOT_FOUND', `No survey ${surveyId}`)
  const self = await withResponses(root, scenarioId, survey)
  const pairSurvey = pairOf(survey, all)
  const pair = pairSurvey ? await withResponses(root, scenarioId, pairSurvey) : undefined
  return summarizeSurvey(survey, self.responses, { minResponses, ...(pair ? { pair } : {}) })
}

/**
 * Every survey of the scenario that has responses, summarized for the exercise record
 * (spec 0419 `ExerciseRecord.surveys`). Archived surveys are left out. A before/after pair
 * reports its comparison once, on the after edition (on the before edition while the after
 * one has no responses); the before edition keeps its own counts.
 */
export async function scenarioSurveySummaries(
  root: string,
  scenarioId: string,
  minResponses: number,
): Promise<SurveySummary[]> {
  const all = (await listSurveys(root, scenarioId)).filter((s) => s.status !== 'archived')
  const loaded = await Promise.all(all.map((s) => withResponses(root, scenarioId, s)))
  const byId = new Map(loaded.map((l) => [l.survey.id, l]))
  const out: SurveySummary[] = []
  for (const item of loaded) {
    if (!item.responses.length) continue
    const pairSurvey = pairOf(item.survey, all)
    const pair = pairSurvey ? byId.get(pairSurvey.id) : undefined
    if (item.survey.edition === 'before' && pair?.responses.length) {
      out.push({
        ...summarizeSurvey(item.survey, item.responses, { minResponses }),
        pairs: [],
        knowledge: [],
      })
      continue
    }
    out.push(
      summarizeSurvey(item.survey, item.responses, { minResponses, ...(pair ? { pair } : {}) }),
    )
  }
  return out
}
