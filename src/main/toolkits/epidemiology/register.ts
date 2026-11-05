// Registers the epidemiology toolkit's code-backed parts: the three metrics, the simulated
// generators and the CDC replay connectors. Figure kinds register when the figures module loads
// and the lint rules when lint-rules.ts loads. Idempotent, so startup and tests may both call it.
import { contactReach, contactsFromBag } from '../../evaluation/metrics/contact-reach'
import { curveAccuracy, curvesFromBag } from '../../evaluation/metrics/curve-accuracy'
import { dispensingThroughput, sitesFromBag } from '../../evaluation/metrics/dispensing-throughput'
import { registerMetric } from '../../evaluation/metrics/registry'
import { cdcNndss, cdcNwss } from '../connectors/cdc'
import { hasConnector, registerConnector } from '../connectors/registry'
import './register-generators'

/** The metrics read the scenario's ground-truth events and the team's recorded decisions. */
export function registerEpidemiologyMetrics(): void {
  registerMetric(contactReach, (b) => ({
    contacts: contactsFromBag(b.events ?? [], b.decisions ?? []),
  }))
  registerMetric(dispensingThroughput, (b) => ({
    sites: sitesFromBag(b.events ?? [], b.decisions ?? []),
  }))
  registerMetric(curveAccuracy, (b) => curvesFromBag(b.events ?? [], b.decisions ?? []))
}

export function registerEpidemiologyToolkit(): void {
  registerEpidemiologyMetrics()
  for (const c of [cdcNwss, cdcNndss]) if (!hasConnector(c.id)) registerConnector(c)
}
