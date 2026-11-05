// Registers the justice case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { JUSTICE_GENERATORS } from './simulate'

const have = new Set(generatorIds())
for (const g of JUSTICE_GENERATORS) if (!have.has(g.id)) registerGenerator(g)
