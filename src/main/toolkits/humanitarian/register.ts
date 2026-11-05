// Registers the humanitarian toolkit's code-backed parts: the replay connectors. Figure kinds
// register when the figures module loads, lint rules when lint-rules.ts loads and generators
// through generator-modules.ts. Idempotent, so startup and tests may both call it.
import { hdxOperationalPresence } from '../connectors/humanitarian-hdx'
import { reliefwebReports } from '../connectors/humanitarian-reliefweb'
import { hasConnector, registerConnector } from '../connectors/registry'

export function registerHumanitarianToolkit(): void {
  for (const c of [hdxOperationalPresence, reliefwebReports])
    if (!hasConnector(c.id)) registerConnector(c)
}
