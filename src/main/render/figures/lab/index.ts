// The lab safety figure kinds (spec 0466 FR-7). Importing this module registers them; the
// figures index imports it once. Ids are stable: the lab safety toolkit names them.
import { registerFigureKind } from '../registry'
import { labClockBoardKind } from './clock-board'

export const LAB_FIGURE_KINDS = [labClockBoardKind] as const

for (const kind of LAB_FIGURE_KINDS) registerFigureKind(kind)
