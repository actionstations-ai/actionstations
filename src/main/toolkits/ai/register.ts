// Registers the AI incidents toolkit's code-backed parts: the four metrics and the simulated
// generators. Figure kinds register when the figures module loads and the lint rules when
// lint-rules.ts loads. Idempotent, so startup and tests may both call it. No network, no files.
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { aiContainment } from '../../evaluation/metrics/ai-containment'
import { aiDisclosuresOnTime } from '../../evaluation/metrics/ai-disclosures-on-time'
import { aiPaymentsStopped } from '../../evaluation/metrics/ai-payments-stopped'
import { aiTimeToDetect } from '../../evaluation/metrics/ai-time-to-detect'
import { registerMetric } from '../../evaluation/metrics/registry'
import './register-generators'

const eventsAndDecisions = (b: { events?: GroundTruthEvent[]; decisions?: MetricDecision[] }) => ({
  events: b.events ?? [],
  decisions: b.decisions ?? [],
})

export function registerAiIncidentMetrics(): void {
  registerMetric(aiTimeToDetect, eventsAndDecisions)
  registerMetric(aiPaymentsStopped, eventsAndDecisions)
  registerMetric(aiDisclosuresOnTime, eventsAndDecisions)
  registerMetric(aiContainment, eventsAndDecisions)
}

export function registerAiIncidentsToolkit(): void {
  registerAiIncidentMetrics()
}
