// Registers the human services toolkits' code-backed parts that load by function: the two replay
// connectors. Figure kinds register when the figures module loads, lint rules when lint-rules.ts
// loads, generators through generator-modules.ts, and the three generic metrics with the built-in
// metrics. Idempotent, so startup and tests may both call it. Registration only: no network.
import { femaOpenShelters } from '../connectors/fema-open-shelters'
import { hhsEmpower } from '../connectors/hhs-empower'
import { hasConnector, registerConnector } from '../connectors/registry'

export function registerHumanServicesToolkit(): void {
  for (const c of [femaOpenShelters, hhsEmpower]) if (!hasConnector(c.id)) registerConnector(c)
}
