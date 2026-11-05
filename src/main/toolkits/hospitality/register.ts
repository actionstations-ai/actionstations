// Registers the hospitality toolkits' code-backed parts: the two metrics and the case-data
// generators. Figure kinds register when the figures module loads and the lint rules when
// lint-rules.ts loads. Idempotent, so startup and tests may both call it.
import { hospitalityAccounting } from '../../evaluation/metrics/hospitality-accounting'
import { hospitalityReportTimeliness } from '../../evaluation/metrics/hospitality-report-timeliness'
import { registerMetric } from '../../evaluation/metrics/registry'
import './register-generators'

export function registerHospitalityMetrics(): void {
  registerMetric(hospitalityAccounting, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
  registerMetric(hospitalityReportTimeliness, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
}

export function registerHospitalityToolkit(): void {
  registerHospitalityMetrics()
}
