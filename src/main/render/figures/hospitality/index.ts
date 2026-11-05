// The hospitality figure kinds (spec 0470 FR-6). Importing this module registers them; the
// figures index imports it once. Ids are stable: the hospitality toolkits name them.
import { registerFigureKind } from '../registry'
import {
  hospDeparturesKind,
  hospFloorStatusKind,
  hospMusterBoardKind,
  hospPortBoardKind,
} from './boards'
import { hospOutbreakCurveKind } from './outbreak'

export const HOSPITALITY_FIGURE_KINDS = [
  hospOutbreakCurveKind,
  hospMusterBoardKind,
  hospFloorStatusKind,
  hospDeparturesKind,
  hospPortBoardKind,
] as const

registerFigureKind(hospOutbreakCurveKind)
registerFigureKind(hospMusterBoardKind)
registerFigureKind(hospFloorStatusKind)
registerFigureKind(hospDeparturesKind)
registerFigureKind(hospPortBoardKind)
