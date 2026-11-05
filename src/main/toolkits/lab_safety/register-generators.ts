// Registers the lab safety case-data generators; generator-modules.ts lists this module.
// Idempotent, so the startup registration and this import may both run.
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { LAB_GENERATORS } from './simulate/generators'

function once<P>(g: SimulatedGenerator<P>): void {
  if (!generatorIds().includes(g.id)) registerGenerator(g)
}

export function registerLabGenerators(): void {
  once(LAB_GENERATORS[0])
  once(LAB_GENERATORS[1])
  once(LAB_GENERATORS[2])
  once(LAB_GENERATORS[3])
  once(LAB_GENERATORS[4])
}

registerLabGenerators()
