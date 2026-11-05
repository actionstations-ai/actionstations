// Registers the epidemiology toolkit's code-backed parts: the simulated generators and the CDC
// replay connectors. Idempotent, so startup and tests may both call it.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { cdcNndss, cdcNwss } from '../connectors/cdc'
import { hasConnector, registerConnector } from '../connectors/registry'
import { EPI_GENERATORS } from './simulate/generators'

export function registerEpidemiologyToolkit(): void {
  const have = new Set(generatorIds())
  for (const g of EPI_GENERATORS) if (!have.has(g.id)) registerGenerator(g)
  for (const c of [cdcNwss, cdcNndss]) if (!hasConnector(c.id)) registerConnector(c)
}
