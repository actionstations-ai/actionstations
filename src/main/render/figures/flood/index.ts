// The flood figure kinds (spec 0454 FR-5, FR-7). Importing this module registers them. The
// hydrograph is shared with the weather toolkit, which references it by id.
import { registerFigureKind } from '../registry'
import { gaugeSummaryKind } from './gauge-summary'
import { hydrographKind } from './hydrograph'
import { rainStageKind } from './rain-stage'
import { riverProfileKind } from './river-profile'

registerFigureKind(hydrographKind)
registerFigureKind(gaugeSummaryKind)
registerFigureKind(riverProfileKind)
registerFigureKind(rainStageKind)

export { crestOf } from './hydrograph'
