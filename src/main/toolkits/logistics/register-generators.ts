// Registers the logistics case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { LOGISTICS_GENERATORS } from './simulate/generators'

const have = new Set(generatorIds())
for (const g of LOGISTICS_GENERATORS) if (!have.has(g.id)) registerGenerator(g)
