// The wildfire figure kinds (spec 0461 FR-7). Importing this module registers them. The maps
// draw with the shared map overlay code; the boards and the AQI series are drawn here.
import { registerFigureKind } from '../registry'
import { aqiSeriesKind } from './aqi-series'
import { circuitBoardKind } from './circuit-board'
import { evacuationBoardKind } from './evacuation-board'
import { fireMapKind } from './fire-map'
import { smokeMapKind } from './smoke-map'

export const WILDFIRE_FIGURE_KINDS = [
  fireMapKind,
  evacuationBoardKind,
  circuitBoardKind,
  aqiSeriesKind,
  smokeMapKind,
] as const

for (const kind of WILDFIRE_FIGURE_KINDS) registerFigureKind(kind as never)
