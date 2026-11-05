// Everything the lab safety toolkit names that is code and is not registered by loading a module:
// the case-data generators and the evaluation metrics. The figure kinds register with the
// figures (render/figures/index.ts) and the guardrail rule with lint-rules.ts. The app calls this
// once at startup; it is idempotent and does no network or file work.
import { registerLabGenerators } from './register-generators'

export function registerLabSafetyToolkit(): void {
  registerLabGenerators()
}
