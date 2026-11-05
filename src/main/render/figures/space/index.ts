// The space weather figure kinds (spec 0468 FR-5). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { impactBoardKind, scalePanelKind } from './boards'
import { protonFluxKind, xrayFluxKind } from './flux'
import { gnssErrorKind } from './gnss'
import { kpSeriesKind } from './kp-series'
import { gicSeriesKind, magnetometerKind, solarWindKind } from './lines'

registerFigureKind(kpSeriesKind)
registerFigureKind(xrayFluxKind)
registerFigureKind(protonFluxKind)
registerFigureKind(magnetometerKind)
registerFigureKind(solarWindKind)
registerFigureKind(gicSeriesKind)
registerFigureKind(gnssErrorKind)
registerFigureKind(scalePanelKind)
registerFigureKind(impactBoardKind)
