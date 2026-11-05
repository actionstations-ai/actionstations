// Pharmacy figure kinds (spec 0463 FR-5). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { coldChainChartKind } from './coldchain'
import { queueChartKind, usageChartKind } from './queue-usage'
import { recallTraceKind } from './recall'
import { daysOnHandKind, inventoryKind } from './shortage'

export const PHARMACY_FIGURE_KIND_IDS = [
  coldChainChartKind.kind,
  daysOnHandKind.kind,
  queueChartKind.kind,
  usageChartKind.kind,
  recallTraceKind.kind,
  inventoryKind.kind,
] as const

registerFigureKind(coldChainChartKind)
registerFigureKind(daysOnHandKind)
registerFigureKind(queueChartKind)
registerFigureKind(usageChartKind)
registerFigureKind(recallTraceKind)
registerFigureKind(inventoryKind)
