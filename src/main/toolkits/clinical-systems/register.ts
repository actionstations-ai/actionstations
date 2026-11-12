// The clinical systems toolkit's app code, registered once at startup from src/main/index.ts
// (issues #1130, #1131): the measures that count units, results and records read the downtime
// model's events through the clinical input provider, and the reconciliation discrepancies are
// released in live play after each progress report. The generator registers through
// generator-modules.ts and the metrics at the bottom of the metric registry. Safe to call twice.
import { onDecisionRecorded } from '../../live/decision-hooks'
import { registerMetricInputProvider } from '../metrics'
import { clinicalInputsProvider, releaseDueDiscrepancies } from './play'

/** The clinical systems measures that read events from the case data. */
export const CLINICAL_SYSTEMS_EVENT_METRICS = [
  'time_to_downtime_procedures',
  'safe_care_losses',
  'critical_result_communication',
  'reconciliation_progress',
  'duplicate_records_created',
] as const

export function registerClinicalSystemsToolkit(): void {
  for (const id of CLINICAL_SYSTEMS_EVENT_METRICS)
    registerMetricInputProvider(id, clinicalInputsProvider)
  onDecisionRecorded(releaseDueDiscrepancies)
}
