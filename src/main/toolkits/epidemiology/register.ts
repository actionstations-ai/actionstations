// Registers the epidemiology toolkit's code-backed parts: the simulated generators now, the
// replay connectors with them as they land. Idempotent, so startup and tests may both call it.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { EPI_GENERATORS } from './simulate/generators'

export function registerEpidemiologyToolkit(): void {
  const have = new Set(generatorIds())
  for (const g of EPI_GENERATORS) if (!have.has(g.id)) registerGenerator(g)
}
