// Earth science figure kinds (spec 0450 FR-8). Importing this module registers them; the generic
// registry module imports it so every renderer path has the kinds.
import { registerFigureKind } from '../registry'
import { GEO_CHART_KINDS } from './charts'
import { GEO_MAP_KINDS } from './maps'

for (const kind of [...GEO_CHART_KINDS, ...GEO_MAP_KINDS]) registerFigureKind(kind)

export const GEO_FIGURE_KINDS = [...GEO_CHART_KINDS, ...GEO_MAP_KINDS].map((k) => k.kind).sort()
