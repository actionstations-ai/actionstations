// Registers the pharmacy toolkit's code-backed parts that are not registered by importing a
// module: the six metrics and the openFDA shortage connector. Figure kinds register with the
// figures module, the lint rules with lint-rules.ts and the simulated generators through
// generator-modules.ts. Idempotent, so startup and tests may both call it; registration only,
// no network and no file reads.
import { PHARMACY_METRICS } from '../../evaluation/metrics/pharmacy'
import { registerMetric } from '../../evaluation/metrics/registry'
import { openfdaShortages } from '../connectors/openfda-shortages'
import { hasConnector, registerConnector } from '../connectors/registry'

/** The metrics read the scenario's ground-truth events and the team's recorded decisions. */
export function registerPharmacyMetrics(): void {
  for (const m of PHARMACY_METRICS)
    registerMetric(m, (b) => ({ events: b.events ?? [], decisions: b.decisions ?? [] }))
}

export function registerPharmacyToolkit(): void {
  registerPharmacyMetrics()
  for (const c of [openfdaShortages]) if (!hasConnector(c.id)) registerConnector(c)
}
