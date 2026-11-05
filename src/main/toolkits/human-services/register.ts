// Registers the human services toolkits' code-backed parts that load by function: the replay
// connectors (open shelters, emPOWER, the Social Vulnerability Index and the 988 Lifeline monthly
// performance file). Figure kinds register when the figures module loads, lint rules when
// lint-rules.ts loads, generators through generator-modules.ts, and the three generic metrics with
// the built-in metrics. Idempotent, so startup and tests may both call it. Registration only: no
// network.
import { cdcSvi } from '../connectors/cdc-svi'
import { femaOpenShelters } from '../connectors/fema-open-shelters'
import { hhsEmpower } from '../connectors/hhs-empower'
import { lifeline988 } from '../connectors/lifeline-988'
import { hasConnector, registerConnector } from '../connectors/registry'

export function registerHumanServicesToolkit(): void {
  for (const c of [femaOpenShelters, hhsEmpower, cdcSvi, lifeline988])
    if (!hasConnector(c.id)) registerConnector(c)
}
