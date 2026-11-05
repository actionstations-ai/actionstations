// Weather figure kinds (spec 0449 FR-5, ADR-0095): importing this module registers them.
import { registerFigureKind } from '../registry'
import { radarKind } from './radar'
import { decisionTimelineKind } from './decision-timeline'
import { mesoanalysisKind, modelPanelKind, satelliteKind } from './grid'
import { meteogramKind } from './meteogram'
import { plumeKind } from './plume'
import { hodographKind, skewTKind } from './sounding'

registerFigureKind(radarKind)
registerFigureKind(skewTKind)
registerFigureKind(hodographKind)
registerFigureKind(satelliteKind)
registerFigureKind(modelPanelKind)
registerFigureKind(mesoanalysisKind)
registerFigureKind(meteogramKind)
registerFigureKind(plumeKind)
registerFigureKind(decisionTimelineKind)

export { radarKind, RadarData } from './radar'
export { PolarField, packPolar } from './polar'
