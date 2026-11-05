// Registers the humanitarian case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { HUMANITARIAN_GENERATORS } from './simulate'

const have = new Set(generatorIds())
for (const g of HUMANITARIAN_GENERATORS) if (!have.has(g.id)) registerGenerator(g)
