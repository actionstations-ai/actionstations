// Registers the AI incident case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { modelIncidentGenerator, syntheticFraudGenerator } from './generators'

function once<P>(g: SimulatedGenerator<P>): void {
  if (!generatorIds().includes(g.id)) registerGenerator(g)
}

once(syntheticFraudGenerator)
once(modelIncidentGenerator)
