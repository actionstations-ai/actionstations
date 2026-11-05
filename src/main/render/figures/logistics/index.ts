// The logistics figure kinds (spec 0462 FR-5). Importing this module registers them; the figures
// index imports it once. Ids are stable: the logistics toolkit names them.
import { registerFigureKind } from '../registry'
import {
  logisticsCongestionBoardKind,
  logisticsDaysOfSupplyKind,
  logisticsShipmentTrackerKind,
  logisticsTraceTableKind,
} from './boards'
import { logisticsSupplierNetworkKind } from './network'
import { logisticsTemperatureChartKind } from './temperature'

export const LOGISTICS_FIGURE_KINDS = [
  logisticsShipmentTrackerKind,
  logisticsDaysOfSupplyKind,
  logisticsSupplierNetworkKind,
  logisticsCongestionBoardKind,
  logisticsTemperatureChartKind,
  logisticsTraceTableKind,
] as const

for (const k of LOGISTICS_FIGURE_KINDS) registerFigureKind(k as never)
