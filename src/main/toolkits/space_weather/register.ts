// Everything the space weather toolkit names that is code and is not registered by an import
// (the figure kinds register with the figures, the lint rules with lint-rules.ts, the generator
// through generator-modules.ts). Idempotent and registration only; the app calls it at startup.
import './register-generators'

export function registerSpaceWeatherToolkit(): void {
  // The generator registers on import above; metrics register in a later change.
}
