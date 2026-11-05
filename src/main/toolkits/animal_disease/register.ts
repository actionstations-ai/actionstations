// Registers the animal disease toolkit's code-backed parts: the four metrics and the APHIS
// replay connector. Figure kinds register when the figures module loads, the lint rules when
// lint-rules.ts loads and the generators through generator-modules.ts. Idempotent, so startup
// and tests may both call it. Registration only: no network and no file reads.
import {
  ANIMAL_METRICS,
  animalContinuity,
  animalDepopTiming,
  animalDisposalBacklog,
  animalSurveillance,
} from '../../evaluation/metrics/animal-disease'
import { registerMetric } from '../../evaluation/metrics/registry'
import { aphisHpai } from '../connectors/aphis-hpai'
import { hasConnector, registerConnector } from '../connectors/registry'
import './register-generators'

const events = (b: { events?: unknown[]; decisions?: unknown[] }) => ({
  events: (b.events ?? []) as never,
  decisions: (b.decisions ?? []) as never,
})

/** The metrics read the scenario's ground-truth events and the team's recorded decisions. */
export function registerAnimalDiseaseMetrics(): void {
  registerMetric(animalDepopTiming, events)
  registerMetric(animalSurveillance, events)
  registerMetric(animalContinuity, events)
  registerMetric(animalDisposalBacklog, events)
}

export const ANIMAL_METRIC_IDS = ANIMAL_METRICS.map((m) => m.id)

export function registerAnimalDiseaseToolkit(): void {
  registerAnimalDiseaseMetrics()
  if (!hasConnector(aphisHpai.id)) registerConnector(aphisHpai)
}
