// Recorded decisions start regulatory clocks (spec 0459 FR-8): a form can name the clock triggers
// a decision fires (a "Material" determination starts the Form 8-K clock). Decisions come from
// the running session's devices and from the facilitator's own file; each fires a trigger once.
import { useEffect } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import { mergeDecisionRecords } from '@shared/decisions/records'
import { fireDecisionTriggers } from './compliance'
import { useLiveDecisions } from './live/use-live-decisions'
import type { UpdateState } from './use-delivery-actions'

export interface DecisionTriggerInput {
  projectPath: string
  scenarioId: string
  state: FacilitatorState
  update: UpdateState
  /** Exercise minutes now. */
  minutes: number
  /** Regulations the project has switched on. */
  enabled: ReadonlySet<string>
  start: Date
}

export function useDecisionTriggers(p: DecisionTriggerInput): void {
  const { forms, decisions } = useLiveDecisions(p.projectPath, p.scenarioId)
  const { state, update, minutes, enabled, start } = p
  const records = mergeDecisionRecords(decisions, state.decisionRecords ?? [])
  const hasFires = forms.some((f) => (f.fires?.length ?? 0) > 0)
  useEffect(() => {
    if (!hasFires || enabled.size === 0) return
    const fire = (s: FacilitatorState) =>
      fireDecisionTriggers(s, forms, records, enabled, minutes, start)
    // Only write when a decision has something new to fire.
    if (fire(state) !== state) update(fire)
    // `minutes` only matters for a decision with no recorded time, so it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hasFires, enabled, forms, decisions, start])
}
