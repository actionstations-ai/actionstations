// Figure data from the lab simulations (spec 0466 FR-7, FR-8): the simulators and the figures meet
// here, so a scenario draws exactly what its case data say. Pure functions.
import type {
  LabAccessLogData,
  LabInventoryData,
  LabSampleRegisterData,
} from '../../render/figures/lab/tables'
import type { LabTrendData } from '../../render/figures/lab/trend'
import type { AccessRow } from './simulate/access'
import type { AlarmParams, AlarmRun } from './simulate/alarm'
import type { InventoryRun } from './simulate/inventory'

type TrendEvent = LabTrendData['events'][number]

const TREND_KINDS = new Set<string>([
  'alarm_sounded',
  'call_out',
  'acknowledged',
  'limit_reached',
  'restored',
])

/** The temperature trend of an alarm run: set point, threshold, limit and the dated events. */
export function trendDataFromAlarm(
  run: AlarmRun,
  p: Pick<AlarmParams, 'unit' | 'setPointC' | 'alarmThresholdC' | 'limitC'>,
  title?: string,
): LabTrendData {
  const events = run.events.filter((e): e is TrendEvent => TREND_KINDS.has(e.kind))
  return {
    title: title ?? `${p.unit} temperature (simulated)`,
    unit: p.unit,
    setPointC: p.setPointC,
    alarmThresholdC: p.alarmThresholdC,
    limitC: p.limitC,
    points: run.points,
    events,
  }
}

/** The inventory table of a count; the discrepancy rows are flagged by the figure itself. */
export function inventoryDataFromRun(
  run: InventoryRun,
  entity: string,
  title = 'Inventory reconciliation (simulated)',
): LabInventoryData {
  return {
    title,
    entity,
    asOf: run.countedAt.slice(0, 16).replace('T', ' '),
    rows: run.rows.map(({ item, location, expected, observed, note }) => ({
      item,
      location,
      expected,
      observed,
      note,
    })),
  }
}

/** The sample register at a moment: samples already moved are `moved`, the rest `at_risk` or `safe`. */
export function registerDataFromAlarm(
  run: AlarmRun,
  unit: string,
  state: { moved?: readonly string[]; atRisk: boolean; lost?: readonly string[] },
  title = 'Sample loss register (simulated)',
): LabSampleRegisterData {
  const moved = new Set(state.moved ?? [])
  const lost = new Set(state.lost ?? [])
  return {
    title,
    unit,
    rows: run.samples.map((s) => ({
      sample: s.sample,
      location: s.location,
      value: s.value,
      backup: s.backup,
      status: lost.has(s.sample)
        ? ('lost' as const)
        : moved.has(s.sample)
          ? ('moved' as const)
          : state.atRisk
            ? ('at_risk' as const)
            : ('safe' as const),
      movedAt: '',
    })),
  }
}

/** The access log table of a generated day. */
export function accessDataFromRows(
  rows: readonly AccessRow[],
  door: string,
  title = 'Access log extract (simulated)',
): LabAccessLogData {
  return {
    title,
    door,
    rows: rows.map((r) => ({
      time: r.time.slice(0, 16).replace('T', ' '),
      person: r.person,
      event: r.event,
      afterHours: r.afterHours,
      note: r.note,
    })),
  }
}
