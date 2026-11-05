// Everything the logistics toolkit registers from code (spec 0462): its metrics and its recall
// and freight data connectors. Called once from src/main/index.ts; idempotent, no network and no file reads.
// Figure kinds, lint rules and generators register by import (figures/index.ts, lint-rules.ts,
// generator-modules.ts).
import { registerMetric } from '../../evaluation/metrics/registry'
import { logisticsNotificationTimeliness } from '../../evaluation/metrics/logistics-notification'
import { logisticsSupplyProtection } from '../../evaluation/metrics/logistics-supply'
import { logisticsTraceCompleteness } from '../../evaluation/metrics/logistics-trace'
import { btsFafStateFlows } from '../connectors/bts-faf'
import { btsFreightIndicators } from '../connectors/bts-freight-indicators'
import { openfdaFoodEnforcement } from '../connectors/openfda-food'
import { hasConnector, registerConnector } from '../connectors/registry'
import './register-generators'

export function registerLogisticsMetrics(): void {
  registerMetric(logisticsTraceCompleteness, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(logisticsNotificationTimeliness, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(logisticsSupplyProtection, (b) => ({
    series: b.series ?? [],
    decisions: b.decisions ?? [],
  }))
}

export function registerLogisticsToolkit(): void {
  registerLogisticsMetrics()
  for (const c of [openfdaFoodEnforcement, btsFreightIndicators, btsFafStateFlows])
    if (!hasConnector(c.id)) registerConnector(c)
}
