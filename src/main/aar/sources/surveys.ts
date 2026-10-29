// Survey results → the record (#419): the summaries the surveys module computes (#422), with
// the anonymity threshold from settings applied. Summaries only: the record never holds a
// response, and the refs are survey:<surveyId>[:<questionId>] (ADR-0026).
import type { SurveySummary } from '@shared/schemas/survey'
import { minResponsesSetting, scenarioSurveySummaries } from '../../surveys/results'

export async function surveysPart(root: string, scenarioId: string): Promise<SurveySummary[]> {
  return scenarioSurveySummaries(root, scenarioId, await minResponsesSetting())
}
