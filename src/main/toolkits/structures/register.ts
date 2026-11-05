// Registers the structures toolkit's code-backed parts that load by function: its four metrics.
// The figure kinds register with the figures module, the lint rules with lint-rules.ts and the
// generators with generator-modules.ts. Idempotent, so startup and tests may both call it.
import { registerMetric } from '../../evaluation/metrics/registry'
import { structuresPlacardAgreement } from '../../evaluation/metrics/structures-placard-agreement'
import { structuresReporting } from '../../evaluation/metrics/structures-reporting'
import { structuresRescueTimeline } from '../../evaluation/metrics/structures-rescue-timeline'
import { structuresWarningToAction } from '../../evaluation/metrics/structures-warning-to-action'
import './generators'

/** The metrics read the scenario's ground-truth events and the team's recorded decisions. */
export function registerStructuresMetrics(): void {
  const pick = (b: { events?: unknown[]; decisions?: unknown[] }) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  })
  registerMetric(structuresWarningToAction, (b) => pick(b) as never)
  registerMetric(structuresReporting, (b) => pick(b) as never)
  registerMetric(structuresRescueTimeline, (b) => pick(b) as never)
  registerMetric(structuresPlacardAgreement, (b) => pick(b) as never)
}

export function registerStructuresToolkit(): void {
  registerStructuresMetrics()
}
