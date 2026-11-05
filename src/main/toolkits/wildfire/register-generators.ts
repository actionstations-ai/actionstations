// Registration of the wildfire generators with the case-data framework; idempotent and guarded
// so the module may load from generator-modules.ts and from the toolkit's register function.
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { wildfireEventGenerator } from './simulate/events'
import { shutoffEventGenerator } from './simulate/shutoff'

function once<P>(g: SimulatedGenerator<P>): void {
  if (!generatorIds().includes(g.id)) registerGenerator(g)
}

export function registerWildfireGenerators(): void {
  once(wildfireEventGenerator)
  once(shutoffEventGenerator)
}

registerWildfireGenerators()
