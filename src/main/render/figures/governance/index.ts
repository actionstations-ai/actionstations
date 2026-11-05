// The governance figure kinds (spec 0459 FR-5). Importing this module registers them; the
// figures index imports it once. Ids are stable: the governance toolkit names them.
import { registerFigureKind } from '../registry'
import { govBiaKind } from './bia'
import { govDecisionTimelineKind } from './decision-timeline'
import { govRecoveryTrackerKind } from './recovery-tracker'

export const GOVERNANCE_FIGURE_KINDS = [
  govBiaKind,
  govRecoveryTrackerKind,
  govDecisionTimelineKind,
] as const

registerFigureKind(govBiaKind)
registerFigureKind(govRecoveryTrackerKind)
registerFigureKind(govDecisionTimelineKind)
