// The humanitarian figure kinds (spec 0469 FR-8). Importing this module registers them; the
// figures index imports it once. Ids are stable: the humanitarian toolkit names them. The
// epidemic curve and attack rates for camp health are the epidemiology toolkit's kinds.
import { registerFigureKind } from '../registry'
import { fundingBarKind, needsCoverageKind } from './coverage'
import { humanitarianPipelineKind } from './pipeline'
import { accessMapKind, securityTimelineKind } from './security'
import { threeWMapKind, threeWMatrixKind } from './three-w'

export const HUMANITARIAN_FIGURE_KINDS = [
  threeWMatrixKind,
  threeWMapKind,
  needsCoverageKind,
  humanitarianPipelineKind,
  fundingBarKind,
  securityTimelineKind,
  accessMapKind,
] as const

registerFigureKind(threeWMatrixKind)
registerFigureKind(threeWMapKind)
registerFigureKind(needsCoverageKind)
registerFigureKind(humanitarianPipelineKind)
registerFigureKind(fundingBarKind)
registerFigureKind(securityTimelineKind)
registerFigureKind(accessMapKind)
