/**
 * Survey responses rebuilt from the session log (spec 0422: the log is the source of truth, the
 * response file is a mirror). A crash can leave the mirror a line short; this puts back every
 * `survey.response` entry the file does not hold, by response id, so running it twice adds
 * nothing. The log entry holds the answers and the minute only, so nothing about a sender comes
 * back with them.
 */
import { roundToMinute } from '@shared/survey-layout'
import { SurveyResponse, type SurveyChannel } from '@shared/schemas'
import type { SessionLogEntry } from '@shared/schemas/live'
import { appendResponse, readResponses } from '../surveys/store'

type LiveChannel = Extract<SurveyChannel, 'live' | 'qr'>

/** Delivery id (the log's `surveyId`) to the survey it opened. */
function surveyOfDelivery(entries: readonly SessionLogEntry[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of entries) {
    const survey = e.data.survey
    if (e.kind === 'survey.open' && e.ref?.surveyId && typeof survey === 'string') {
      out.set(e.ref.surveyId, survey)
    }
  }
  return out
}

function responseFrom(
  e: SessionLogEntry,
  surveyId: string,
  channel: LiveChannel,
): SurveyResponse | undefined {
  const responseId = e.data.responseId
  const parsed = SurveyResponse.safeParse({
    id: responseId,
    surveyId,
    deliveryId: e.ref?.surveyId,
    channel,
    at: roundToMinute(e.at),
    answers: e.data.answers ?? {},
    otherText: {},
  })
  return parsed.success ? parsed.data : undefined
}

/** How many responses were put back. A survey that no longer exists is skipped. */
export async function rebuildSurveyResponses(
  root: string,
  scenarioId: string,
  entries: readonly SessionLogEntry[],
  channel: LiveChannel,
): Promise<number> {
  const deliveries = surveyOfDelivery(entries)
  const known = new Map<string, Set<string>>()
  let restored = 0
  for (const e of entries) {
    if (e.kind !== 'survey.response' || !e.ref?.surveyId) continue
    const surveyId = deliveries.get(e.ref.surveyId)
    if (!surveyId) continue
    const response = responseFrom(e, surveyId, channel)
    if (!response) continue
    if (!known.has(surveyId)) {
      const stored = await readResponses(root, scenarioId, surveyId).catch(() => [])
      known.set(surveyId, new Set(stored.map((r) => r.id)))
    }
    const ids = known.get(surveyId)!
    if (ids.has(response.id)) continue
    try {
      await appendResponse(root, scenarioId, response)
      ids.add(response.id)
      restored += 1
    } catch {
      // the survey was deleted since: its responses have nowhere to go
    }
  }
  return restored
}
