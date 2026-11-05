// Registers the pharmacy toolkit's code-backed parts that are not registered by importing a
// module: the openFDA shortage connector now, the simulated generators and metrics as they are
// added. Figure kinds register with the figures module and the lint rules with lint-rules.ts.
// Idempotent, so startup and tests may both call it; registration only, no network.
import { hasConnector, registerConnector } from '../connectors/registry'
import { openfdaShortages } from '../connectors/openfda-shortages'

export function registerPharmacyToolkit(): void {
  for (const c of [openfdaShortages]) if (!hasConnector(c.id)) registerConnector(c)
}
