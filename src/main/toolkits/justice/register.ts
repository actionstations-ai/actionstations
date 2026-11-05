// Registers the justice toolkit's code-backed parts: its metrics and generators. Figure kinds
// register when the figures module loads and the lint rules when lint-rules.ts loads.
// Idempotent, so startup and tests may both call it.
import { justiceDispatchServiceLevel } from '../../evaluation/metrics/justice-dispatch-service-level'
import { justiceTimeToDecision } from '../../evaluation/metrics/justice-time-to-decision'
import { registerMetric } from '../../evaluation/metrics/registry'
import './register-generators'

export function registerJusticeMetrics(): void {
  registerMetric(justiceTimeToDecision, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(justiceDispatchServiceLevel, (b) => ({ events: b.events ?? [] }))
}

export function registerJusticeToolkit(): void {
  registerJusticeMetrics()
}
