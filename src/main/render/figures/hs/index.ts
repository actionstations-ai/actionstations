// The human services figure kinds (spec 0464 FR-7). Importing this module registers them; the
// figures index imports it once. Ids are stable: the human services toolkits name them.
import { registerFigureKind } from '../registry'
import { hsContactSeriesKind, hsQueueBoardKind, hsStaffingCoverageKind } from './contacts'
import { hsDisplacedTrackerKind, hsReunificationFlowKind } from './reunification'
import { hsShelterDashboardKind, hsShelterMapKind } from './shelter'

export const HS_FIGURE_KINDS = [
  hsContactSeriesKind,
  hsQueueBoardKind,
  hsStaffingCoverageKind,
  hsShelterDashboardKind,
  hsShelterMapKind,
  hsReunificationFlowKind,
  hsDisplacedTrackerKind,
] as const

registerFigureKind(hsContactSeriesKind)
registerFigureKind(hsQueueBoardKind)
registerFigureKind(hsStaffingCoverageKind)
registerFigureKind(hsShelterDashboardKind)
registerFigureKind(hsShelterMapKind)
registerFigureKind(hsReunificationFlowKind)
registerFigureKind(hsDisplacedTrackerKind)
