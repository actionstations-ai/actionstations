// Everything the lab safety toolkit names that is code and is not registered by loading a module:
// the case-data generators and the evaluation metrics. The figure kinds register with the
// figures (render/figures/index.ts) and the guardrail rule with lint-rules.ts. The app calls this
// once at startup; it is idempotent and does no network or file work.
import { registerMetric } from '../../evaluation/metrics/registry'
import { labDataRecovery } from '../../evaluation/metrics/lab-data-recovery'
import { labNotificationTiming } from '../../evaluation/metrics/lab-notification-timing'
import { labSamplesSaved } from '../../evaluation/metrics/lab-samples-saved'
import { registerEpidemiologyMetrics } from '../epidemiology/register'
import { registerLabGenerators } from './register-generators'

/** The metrics read the scenario's ground-truth events, series and the team's recorded decisions. */
export function registerLabMetrics(): void {
  registerMetric(labNotificationTiming, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(labSamplesSaved, (b) => ({ events: b.events ?? [], decisions: b.decisions ?? [] }))
  registerMetric(labDataRecovery, (b) => ({ series: b.series ?? [], decisions: b.decisions ?? [] }))
}

export function registerLabSafetyToolkit(): void {
  registerLabGenerators()
  registerLabMetrics()
  // The exposure follow-up is scored with the epidemiology contact reach measure.
  registerEpidemiologyMetrics()
}
