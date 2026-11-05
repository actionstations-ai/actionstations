// The connectors that ship with the app. Each toolkit's connectors register here (append a line
// per connector); registration is idempotent so callers may invoke it more than once.
import { femaNfhlConnector } from './fema-nfhl'
import { nwpsConnector } from './nwps'
import { nwsFimConnector } from './nws-fim'
import { hasConnector, registerConnector, type Connector } from './registry'
import { usgsWaterdataConnector } from './usgs-waterdata'

const BUILTIN: Connector[] = [
  nwpsConnector,
  usgsWaterdataConnector,
  femaNfhlConnector,
  nwsFimConnector,
]

export function registerBuiltinConnectors(): void {
  for (const c of BUILTIN) if (!hasConnector(c.id)) registerConnector(c)
}
