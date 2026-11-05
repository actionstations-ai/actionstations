// The AI incidents figure kinds (spec 0467 FR-5). Importing this module registers them; the
// figures index imports it once. Ids are stable: the AI incidents toolkit names them.
import { registerFigureKind } from '../registry'
import { aiDetectorScoresKind } from './detector'
import { aiInventoryTableKind, aiPaymentTimelineKind } from './payment'
import { aiEvalSeriesKind, aiModerationQueueKind } from './series'

export const AI_FIGURE_KINDS = [
  aiEvalSeriesKind,
  aiModerationQueueKind,
  aiDetectorScoresKind,
  aiPaymentTimelineKind,
  aiInventoryTableKind,
] as const

registerFigureKind(aiEvalSeriesKind)
registerFigureKind(aiModerationQueueKind)
registerFigureKind(aiDetectorScoresKind)
registerFigureKind(aiPaymentTimelineKind)
registerFigureKind(aiInventoryTableKind)
