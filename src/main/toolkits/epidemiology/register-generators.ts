// Registers the epidemiology case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { EPI_GENERATORS } from './simulate/generators'

const have = new Set(generatorIds())
for (const g of EPI_GENERATORS) if (!have.has(g.id)) registerGenerator(g)
