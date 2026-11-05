// Weather figure kinds (spec 0449 FR-5, ADR-0095): importing this module registers them.
import { registerFigureKind } from '../registry'
import { radarKind } from './radar'

registerFigureKind(radarKind)

export { radarKind, RadarData } from './radar'
export { PolarField, packPolar } from './polar'
