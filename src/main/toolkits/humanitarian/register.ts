// Registers the humanitarian toolkit's code-backed parts: the two metrics and the replay
// connectors. Figure kinds register when the figures module loads, lint rules when lint-rules.ts
// loads and generators through generator-modules.ts. Idempotent, so startup and tests may both
// call it.
import { humanitarianGapClosure } from '../../evaluation/metrics/humanitarian-gap-closure'
import { humanitarianNeedsCoverage } from '../../evaluation/metrics/humanitarian-needs-coverage'
import { registerMetric } from '../../evaluation/metrics/registry'
import { hdxOperationalPresence } from '../connectors/humanitarian-hdx'
import { reliefwebReports } from '../connectors/humanitarian-reliefweb'
import { hasConnector, registerConnector } from '../connectors/registry'

/** The metrics read the scenario's ground-truth events and the team's recorded decisions. */
export function registerHumanitarianMetrics(): void {
  registerMetric(humanitarianGapClosure, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(humanitarianNeedsCoverage, (b) => ({ decisions: b.decisions ?? [] }))
}

export function registerHumanitarianToolkit(): void {
  registerHumanitarianMetrics()
  for (const c of [hdxOperationalPresence, reliefwebReports])
    if (!hasConnector(c.id)) registerConnector(c)
}
