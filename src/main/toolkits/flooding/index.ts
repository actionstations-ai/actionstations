// Registration of the flooding generators with the case-data framework; idempotent.
import {
  generatorIds,
  registerGenerator,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { registerBuiltinConnectors } from '../connectors'
import { flashEventGenerator, replayForecastGenerator, riverEventGenerator } from './generators'

function once<P>(g: SimulatedGenerator<P>): void {
  if (!generatorIds().includes(g.id)) registerGenerator(g)
}

export function registerFloodGenerators(): void {
  once(riverEventGenerator)
  once(flashEventGenerator)
  once(replayForecastGenerator)
}

/** Everything the flooding toolkit names that is code: connectors and generators (the figure kinds register with the figures, the lint rules with lint-rules.ts). The app calls this once at startup. */
export function registerFloodingToolkit(): void {
  registerBuiltinConnectors()
  registerFloodGenerators()
}
