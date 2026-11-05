// Registration of the flooding generators with the case-data framework; idempotent.
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { flashEventGenerator, replayForecastGenerator, riverEventGenerator } from './generators'

function once<P>(g: SimulatedGenerator<P>): void {
  if (!generatorIds().includes(g.id)) registerGenerator(g)
}

export function registerFloodGenerators(): void {
  once(riverEventGenerator)
  once(flashEventGenerator)
  once(replayForecastGenerator)
}
