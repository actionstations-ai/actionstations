// Everything the space weather toolkit names that is code and is not registered by an import:
// its metric. Figure kinds register with the figures module, lint rules with lint-rules.ts and the
// generator through generator-modules.ts. Idempotent and registration only; the app calls it once
// at startup.
import { registerMetric } from '../../evaluation/metrics/registry'
import { spaceDissemination } from '../../evaluation/metrics/space-dissemination'
import './register-generators'

export function registerSpaceWeatherMetrics(): void {
  registerMetric(spaceDissemination, (b) => ({
    events: b.events ?? [],
    decisions: b.decisions ?? [],
  }))
}

export function registerSpaceWeatherToolkit(): void {
  registerSpaceWeatherMetrics()
}
