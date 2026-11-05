// Registers the governance toolkit's code-backed parts: the three metrics and the simulated
// incident generator. Figure kinds register when the figures module loads and the lint rules when
// lint-rules.ts loads. Idempotent, so startup and tests may both call it; registration only (no
// network, no file reads).
import { govDecisionDocumentation } from '../../evaluation/metrics/governance-documentation'
import { govDisclosureTiming } from '../../evaluation/metrics/governance-disclosure-timing'
import { govRecoveryRto } from '../../evaluation/metrics/governance-recovery'
import { registerMetric } from '../../evaluation/metrics/registry'
import './register-generators'

/** The metrics read the incident's ground-truth events and the team's recorded decisions. */
export function registerGovernanceMetrics(): void {
  registerMetric(govDisclosureTiming, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(govRecoveryRto, (b) => ({ events: b.events ?? [] }))
  registerMetric(govDecisionDocumentation, (b) => ({ decisions: b.decisions ?? [] }))
}

export function registerGovernanceToolkit(): void {
  registerGovernanceMetrics()
}
