// Registers the earth science toolkits' code-backed parts: the replay connectors and the simulated
// generators. Idempotent, so startup and tests may both call it.
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { comcat } from '../connectors/geo/comcat'
import { fdsnWaveforms } from '../connectors/geo/fdsn'
import { landslideAssessments, quaternaryFaults } from '../connectors/geo/hazard-layers'
import { scenarioShakemaps } from '../connectors/geo/scenario-shakemaps'
import { tsunamiEvents } from '../connectors/geo/tsunami-events'
import { volcanoNotices } from '../connectors/geo/volcano-notices'
import { coopsTides, ndbcDart } from '../connectors/geo/water-level'
import { hasConnector, registerConnector } from '../connectors/registry'

export const GEO_CONNECTORS = [
  comcat,
  scenarioShakemaps,
  fdsnWaveforms,
  volcanoNotices,
  tsunamiEvents,
  coopsTides,
  ndbcDart,
  quaternaryFaults,
  landslideAssessments,
]

export function registerGeoscienceToolkits(
  generators: Parameters<typeof registerGenerator>[0][] = [],
): void {
  const have = new Set(generatorIds())
  for (const g of generators) if (!have.has(g.id)) registerGenerator(g)
  for (const c of GEO_CONNECTORS) if (!hasConnector(c.id)) registerConnector(c)
}
