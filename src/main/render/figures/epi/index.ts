// The epidemiology figure kinds (spec 0457 FR-5). Importing this module registers them; the
// figures index imports it once. Ids are stable: the epidemiology toolkit names them.
import { registerFigureKind } from '../registry'
import { epiLabBoardKind, epiDispensingKind, epiWastewaterKind } from './boards'
import { epiCurveKind } from './curve'
import { epiContactNetworkKind } from './network'
import { epiSpotMapKind } from './spot-map'
import { epiAttackRatesKind, epiLineListKind } from './tables'

export const EPI_FIGURE_KINDS = [
  epiCurveKind,
  epiLineListKind,
  epiAttackRatesKind,
  epiSpotMapKind,
  epiContactNetworkKind,
  epiLabBoardKind,
  epiDispensingKind,
  epiWastewaterKind,
] as const

registerFigureKind(epiCurveKind)
registerFigureKind(epiLineListKind)
registerFigureKind(epiAttackRatesKind)
registerFigureKind(epiSpotMapKind)
registerFigureKind(epiContactNetworkKind)
registerFigureKind(epiLabBoardKind)
registerFigureKind(epiDispensingKind)
registerFigureKind(epiWastewaterKind)
