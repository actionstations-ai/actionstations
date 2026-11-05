// Clinical care figure kinds (spec 0452 FR-5, FR-6). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { evacuationProgressKind, unitCensusKind } from './boards'
import { earlyWarningScoreKind } from './score'
import { labTrendKind, staffingVsDemandKind } from './trend'
import { vitalsFlowsheetKind, vitalsMonitorKind } from './vitals'

export const CLINICAL_FIGURE_KIND_IDS = [
  vitalsMonitorKind.kind,
  vitalsFlowsheetKind.kind,
  earlyWarningScoreKind.kind,
  labTrendKind.kind,
  staffingVsDemandKind.kind,
  unitCensusKind.kind,
  evacuationProgressKind.kind,
] as const

registerFigureKind(vitalsMonitorKind)
registerFigureKind(vitalsFlowsheetKind)
registerFigureKind(earlyWarningScoreKind)
registerFigureKind(labTrendKind)
registerFigureKind(staffingVsDemandKind)
registerFigureKind(unitCensusKind)
registerFigureKind(evacuationProgressKind)
