// Registers the justice toolkit's code-backed parts: its metrics, generators and replay connectors
// (city calls for service, jail population trends, FBI reported crime). Figure kinds
// register when the figures module loads and the lint rules when lint-rules.ts loads.
// Idempotent, so startup and tests may both call it.
import { justiceDispatchServiceLevel } from '../../evaluation/metrics/justice-dispatch-service-level'
import { justiceTimeToDecision } from '../../evaluation/metrics/justice-time-to-decision'
import { registerMetric } from '../../evaluation/metrics/registry'
import { fbiCdeCrime } from '../connectors/fbi-cde-crime'
import { openCadCalls } from '../connectors/open-cad-calls'
import { hasConnector, registerConnector } from '../connectors/registry'
import { veraJailTrends } from '../connectors/vera-jail-trends'
import './register-generators'

export function registerJusticeMetrics(): void {
  registerMetric(justiceTimeToDecision, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(justiceDispatchServiceLevel, (b) => ({ events: b.events ?? [] }))
}

export function registerJusticeConnectors(): void {
  for (const c of [openCadCalls, veraJailTrends, fbiCdeCrime])
    if (!hasConnector(c.id)) registerConnector(c)
}

export function registerJusticeToolkit(): void {
  registerJusticeMetrics()
  registerJusticeConnectors()
}
