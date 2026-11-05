// Everything the wildfire toolkit names that is code and not registered by importing a module:
// the simulated generators now, and the public data connectors and metrics as they land. The app
// calls this once at startup; it is idempotent and does no network or file reads.
import { registerWildfireGenerators } from './register-generators'

export function registerWildfireToolkit(): void {
  registerWildfireGenerators()
}
