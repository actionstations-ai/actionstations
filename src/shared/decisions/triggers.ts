// Regulatory clock triggers a recorded decision fires (spec 0459 FR-8). A form names the
// triggers (data); this reads a record against them. Pure, so the facilitator screen and tests
// agree. Whether the regulation is switched on, and firing a trigger only once, are the caller's.
import type { DecisionForm, DecisionRecord } from '../schemas/decisions'

export interface FiredByDecision {
  regulationId: string
  triggerId: string
}

/** The triggers `record` fires under `form`: unconditional ones, and those whose choice was made. */
export function decisionTriggers(
  form: Pick<DecisionForm, 'fires'> | undefined,
  record: Pick<DecisionRecord, 'fields'>,
): FiredByDecision[] {
  return (form?.fires ?? [])
    .filter((f) => f.fieldId === undefined || record.fields[f.fieldId] === f.optionId)
    .map((f) => ({ regulationId: f.regulationId, triggerId: f.triggerId }))
}
