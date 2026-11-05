// The data connectors of the spill and plume toolkit (spec 0455 FR-6). Registered once at app
// start; registering again is a no-op so tests and hot reloads are safe.
import { hasConnector, registerConnector, type Connector } from './registry'
import { noaaCoops } from './noaa-coops'
import { noaaEsi } from './noaa-esi'
import { noaaNdbc } from './noaa-ndbc'

export const SPILL_CONNECTORS: readonly Connector[] = [noaaCoops, noaaNdbc, noaaEsi]

export function registerSpillConnectors(): void {
  for (const c of SPILL_CONNECTORS) if (!hasConnector(c.id)) registerConnector(c)
}
