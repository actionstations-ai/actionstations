// Spill and plume figure kinds (spec 0455 FR-5, ADR-0075). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { boomPlanKind } from './boom'
import { esiExcerptKind } from './esi'
import { plumeFootprintKind } from './plume'
import { spillTrajectoryKind } from './trajectory'
import { oilWeatheringKind } from './weathering'

registerFigureKind(oilWeatheringKind)
registerFigureKind(plumeFootprintKind)
registerFigureKind(spillTrajectoryKind)
registerFigureKind(esiExcerptKind)
registerFigureKind(boomPlanKind)

export { boomPlanKind, esiExcerptKind, oilWeatheringKind, plumeFootprintKind, spillTrajectoryKind }
