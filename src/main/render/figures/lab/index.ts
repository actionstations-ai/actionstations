// The lab safety figure kinds (spec 0466 FR-7). Importing this module registers them; the
// figures index imports it once. Ids are stable: the lab safety toolkit names them. The facility
// status board (ventilation, power, alarms) is the generic status_board kind.
import { registerFigureKind } from '../registry'
import { labClockBoardKind } from './clock-board'
import { labAccessLogKind, labInventoryKind, labSampleRegisterKind } from './tables'
import { labTrendKind } from './trend'

export const LAB_FIGURE_KINDS = [
  labClockBoardKind,
  labTrendKind,
  labInventoryKind,
  labSampleRegisterKind,
  labAccessLogKind,
] as const

registerFigureKind(labClockBoardKind)
registerFigureKind(labTrendKind)
registerFigureKind(labInventoryKind)
registerFigureKind(labSampleRegisterKind)
registerFigureKind(labAccessLogKind)
