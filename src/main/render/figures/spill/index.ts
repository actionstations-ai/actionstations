// Spill and plume figure kinds (spec 0455 FR-5, ADR-0075). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { plumeFootprintKind } from './plume'
import { oilWeatheringKind } from './weathering'

registerFigureKind(oilWeatheringKind)
registerFigureKind(plumeFootprintKind)

export { oilWeatheringKind, plumeFootprintKind }
