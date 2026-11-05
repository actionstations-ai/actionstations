// The weather toolkit's app code: the replay connectors for the public archives (spec 0449
// FR-7). The simulated generators register through generator-modules (like the other fields'),
// the figure kinds when the figures module loads, the lint rules in lint-rules.
import { hasConnector, registerConnector, type Connector } from '../connectors/registry'
import { iemSoundingsConnector, iemWarningsConnector } from '../connectors/iem'
import { nexradConnector } from '../connectors/nexrad'
import { nhcConnector } from '../connectors/nhc'
import { spcConnector } from '../connectors/spc'

const CONNECTORS: readonly Connector[] = [
  nexradConnector,
  spcConnector,
  iemWarningsConnector,
  iemSoundingsConnector,
  nhcConnector,
]

/** Register the weather connectors once; the app calls this at startup. */
export function registerWeatherToolkit(): void {
  for (const c of CONNECTORS) if (!hasConnector(c.id)) registerConnector(c)
}
