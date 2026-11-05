// EMS figure kinds (spec 0456 FR-4). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { hospitalBoardKind } from './hospital-board'
import { patientBoardKind } from './patient-board'
import { triageCountsKind } from './triage-counts'

registerFigureKind(triageCountsKind)
registerFigureKind(patientBoardKind)
registerFigureKind(hospitalBoardKind)

export { hospitalBoardKind, patientBoardKind, triageCountsKind }
