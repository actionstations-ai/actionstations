// The justice figure kinds (spec 0465 FR-8). Importing this module registers them; the figures
// index imports it once. Ids are stable: the justice toolkit names them.
import { registerFigureKind } from '../registry'
import { JUSTICE_FIGURE_KINDS } from './kinds'

for (const kind of JUSTICE_FIGURE_KINDS) registerFigureKind(kind)

export { JUSTICE_FIGURE_KINDS } from './kinds'
