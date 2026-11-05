// The structures figure kinds (spec 0471 FR-5). Importing this module registers them; the
// figures index imports it once. Ids are stable: the structures toolkit names them.
import { registerFigureKind } from '../registry'
import { structuresAssignmentMapKind } from './assignment-map'
import { structuresMonitoringKind } from './monitoring'
import { structuresSitePlanKind } from './site-plan'
import { structuresStatusBoardKind } from './status-board'

export const STRUCTURES_FIGURE_KIND_IDS = [
  structuresMonitoringKind.kind,
  structuresSitePlanKind.kind,
  structuresStatusBoardKind.kind,
  structuresAssignmentMapKind.kind,
] as const

registerFigureKind(structuresMonitoringKind)
registerFigureKind(structuresSitePlanKind)
registerFigureKind(structuresStatusBoardKind)
registerFigureKind(structuresAssignmentMapKind)
