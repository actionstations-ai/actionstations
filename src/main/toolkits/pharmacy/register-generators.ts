// Registers the pharmacy case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { PHARMACY_GENERATORS } from './simulate/generators'

const have = new Set(generatorIds())
for (const g of PHARMACY_GENERATORS) if (!have.has(g.id)) registerGenerator(g as SimulatedGenerator)
