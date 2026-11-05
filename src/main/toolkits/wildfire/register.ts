// Everything the wildfire toolkit names that is code and not registered by importing a module:
// the simulated generators, the two wildfire metrics and the public data connectors. The app
// calls this once at startup; it is idempotent and does no network or file reads.
import { registerMetric, type MetricInputBag } from '../../evaluation/metrics/registry'
import { wildfireCustomerReach } from '../../evaluation/metrics/wildfire-customer-reach'
import { wildfireNotificationWindows } from '../../evaluation/metrics/wildfire-notification-windows'
import { airnowConnector } from '../connectors/wildfire-airnow'
import { firmsHotspotsConnector } from '../connectors/wildfire-firms'
import { hmsSmokeConnector } from '../connectors/wildfire-hms'
import { wfigsPerimetersConnector } from '../connectors/wildfire-wfigs'
import { hasConnector, registerConnector } from '../connectors/registry'
import { registerWildfireGenerators } from './register-generators'

/** Both metrics read the scenario's ground-truth events and the team's recorded decisions. */
export function registerWildfireMetrics(): void {
  const pick = (b: MetricInputBag) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  })
  registerMetric(wildfireNotificationWindows, pick)
  registerMetric(wildfireCustomerReach, pick)
}

const CONNECTORS = [
  wfigsPerimetersConnector,
  firmsHotspotsConnector,
  hmsSmokeConnector,
  airnowConnector,
]

export function registerWildfireToolkit(): void {
  for (const c of CONNECTORS) if (!hasConnector(c.id)) registerConnector(c)
  registerWildfireMetrics()
  registerWildfireGenerators()
}
