// surveys:* (#422): survey definitions, paper/manual responses and results for one scenario.
// Live delivery (surveys:open-live / surveys:close-live, spec 0422 FR-5, FR-7) is added by the
// live-play work; see src/main/surveys/wire.ts for the seam.
import { z } from 'zod'
import { channel } from './define'
import { IsoDateTime, SafeId } from '../schemas/common'
import {
  Survey,
  SurveyResponse,
  SurveyResponseInput,
  SurveySummary,
  SurveyTemplateInfo,
} from '../schemas/survey'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })
const One = S.extend({ surveyId: SafeId })

export const SurveyListItem = z.object({
  survey: Survey,
  responseCount: z.number().int(),
})
export type SurveyListItem = z.infer<typeof SurveyListItem>

export const surveyChannels = {
  /** Every survey of the scenario with its response count, oldest first. */
  'surveys:list': channel(S, z.array(SurveyListItem)),
  'surveys:get': channel(One, Survey),
  /** Save a definition. CONFLICT (details.reason 'stale') when the file is newer than the base. */
  'surveys:save': channel(
    S.extend({ survey: Survey, baseUpdatedAt: IsoDateTime.optional() }),
    Survey,
  ),
  /** Delete a survey and its responses. */
  'surveys:delete': channel(One, z.void()),
  'surveys:templates': channel(z.void(), z.array(SurveyTemplateInfo)),
  /** Create from a template ('blank' for an empty survey); paired templates create both editions. */
  'surveys:from-template': channel(
    S.extend({ templateId: z.string().max(80) }),
    z.object({ surveys: z.array(Survey) }),
  ),
  /** Copy a survey's definition (no responses) as a new draft. */
  'surveys:duplicate': channel(One, Survey),
  /** Stored responses, for the facilitator's own view; never shown per respondent in the UI. */
  'surveys:responses': channel(One, z.array(SurveyResponse)),
  /** Enter one paper (or manually typed) response. Returns its id and the new response count. */
  'surveys:add-response': channel(
    One.extend({ response: SurveyResponseInput }),
    z.object({ responseId: SafeId, count: z.number().int() }),
  ),
  /** Remove one response (responseId) or all of them. Returns the remaining count. */
  'surveys:delete-responses': channel(
    One.extend({ responseId: SafeId.optional() }),
    z.object({ count: z.number().int() }),
  ),
  /** Results with the anonymity threshold from settings applied. */
  'surveys:summary': channel(One, SurveySummary),
}
