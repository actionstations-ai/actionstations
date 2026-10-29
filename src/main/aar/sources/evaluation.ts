// evaluation.json → the record (#419): observations rated on the Facilitate screen or typed up
// from paper EEGs, each with the ref obs:<id>. `evaluator` is the free label the schema allows
// ("Evaluator 2"); it never reaches the prompt or the document body.
import type { RecordObservation } from '@shared/schemas/aar'
import type { EvaluationRecord, Observation } from '@shared/schemas/evaluation'

export const observationRef = (id: string): string => `obs:${id}`

export function toRecordObservation(o: Observation): RecordObservation {
  return { ...o, ref: observationRef(o.id) }
}

export function evaluationPart(record: EvaluationRecord): RecordObservation[] {
  return [...record.observations]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map(toRecordObservation)
}
