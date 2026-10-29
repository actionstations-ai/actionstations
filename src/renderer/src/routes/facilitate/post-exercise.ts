import type { SurveyListItem } from '@shared/ipc/surveys'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { Scenario } from '@shared/schemas/scenario'

export interface ChecklistLine {
  id: string
  label: string
  done: boolean
  hint: string
}

export const endexDelivered = (
  scenario: Pick<Scenario, 'msel'>,
  state: FacilitatorState,
): boolean =>
  scenario.msel.some((r) => r.purposeTag === 'ENDEX' && state.delivered[r.id] !== undefined)

/** The lines of the checklist for what the scenario has recorded so far. */
export function checklistLines(
  state: Pick<FacilitatorState, 'hotwash'>,
  surveys: readonly SurveyListItem[],
): ChecklistLine[] {
  const feedback = surveys.some(
    (s) => s.survey.kind === 'participant_feedback' && s.responseCount > 0,
  )
  return [
    {
      id: 'hotwash',
      label: 'Hot wash',
      done: state.hotwash.length > 0,
      hint: 'Open the Hot wash tab and record what went well and what to improve.',
    },
    {
      id: 'feedback',
      label: 'Participant feedback',
      done: feedback,
      hint: 'Send the Participant Feedback Form from the Live tab, or print it.',
    },
    {
      id: 'aar',
      label: 'After-action report',
      done: false,
      hint: 'Draft it from Export once the hot wash and feedback are in.',
    },
  ]
}
