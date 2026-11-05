// The logistics figure kinds (#801): each draws valid SVG from simulation-built data, writes a
// summary with the key values, offers a data table, never relies on color alone, renders the same
// bytes twice and refuses bad data.
import { describe, expect, it } from 'vitest'
import { excursionSummary } from '@shared/logistics/arithmetic'
import { simulateNetwork } from '../../../toolkits/logistics/simulate/network'
import { generateTraceRecords } from '../../../toolkits/logistics/simulate/trace-records'
import { traceLot } from '../../../toolkits/logistics/trace'
import {
  daysOfSupplyData,
  shipmentTrackerData,
  supplierNetworkData,
  temperatureChartData,
  traceTableData,
} from '../../../toolkits/logistics/figure-data'
import { listFigureKinds, renderFigure } from '../index'
import { LOGISTICS_FIGURE_KINDS } from './index'

const net = simulateNetwork({ seed: 4 })
const set = generateTraceRecords({ seed: 2 })

const FIXTURES: Record<string, unknown> = {
  logistics_shipment_tracker: shipmentTrackerData(net, 12, 'Open shipments'),
  logistics_days_of_supply: daysOfSupplyData(net, 26, 'Days of supply, day 26'),
  logistics_supplier_network: supplierNetworkData(net, 10, 'Supplier network, day 10'),
  logistics_congestion_board: {
    title: 'Lane and port congestion',
    asOf: '2026-11-08T12:00:00Z',
    rows: [
      {
        location: 'Port of Lindgren',
        kind: 'port',
        waiting: 31,
        dwellDays: 6.5,
        trend: 'rising',
        state: 'congested',
        note: 'Two berths out',
      },
      {
        location: 'Marlow rail ramp',
        kind: 'rail_ramp',
        waiting: 4,
        dwellDays: 1.2,
        trend: 'steady',
        state: 'normal',
        note: '',
      },
      {
        location: 'Eastgate Channel',
        kind: 'canal',
        waiting: 112,
        dwellDays: 5.8,
        trend: 'rising',
        state: 'closed',
        note: 'Vessel aground',
      },
    ],
  },
  logistics_temperature_chart: temperatureChartData({
    startDate: '2026-11-05T00:00:00Z',
    low: 1,
    high: 5,
    peak: 11.4,
    startMinute: 135,
    durationMin: 300,
    title: 'Cooler 4 temperature',
  }),
  logistics_trace_table: traceTableData(traceLot(set.records, set.lot), 'Trace of the lot'),
}

describe('logistics figure kinds', () => {
  it('registers beside the generic kinds', () => {
    const have = listFigureKinds()
    for (const k of LOGISTICS_FIGURE_KINDS) expect(have).toContain(k.kind)
    expect(have).toContain('table')
  })

  it('has a fixture for every kind', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(LOGISTICS_FIGURE_KINDS.map((k) => k.kind).sort())
  })

  it.each(Object.keys(FIXTURES))(
    '%s draws accessible, deterministic output with a summary and table',
    (kind) => {
      const a = renderFigure({ kind, data: FIXTURES[kind] })
      const b = renderFigure({ kind, data: FIXTURES[kind] })
      expect(a.svg).toBe(b.svg)
      expect(a.svg).toMatch(/^<svg [^>]*role="img"/)
      expect(a.svg).toContain('<title')
      expect(a.summary.length).toBeGreaterThan(30)
      expect(a.table?.rows.length).toBeGreaterThan(0)
      expect(a.summary).toMatch(/[Ss]imulated|simulated/)
    },
  )

  it('refuses bad data', () => {
    expect(() => renderFigure({ kind: 'logistics_days_of_supply', data: { rows: [] } })).toThrow()
    expect(() =>
      renderFigure({
        kind: 'logistics_temperature_chart',
        data: { low: 5, high: 1, readings: [] },
      }),
    ).toThrow()
  })
})

describe('what the figures say', () => {
  it('days of supply puts the lowest row in the summary with a stock-out date', () => {
    const out = renderFigure({
      kind: 'logistics_days_of_supply',
      data: FIXTURES.logistics_days_of_supply,
    })
    const first = out.table!.rows[0]!
    expect(['OUT', 'CRITICAL', 'LOW', 'OK']).toContain(first[8])
    const worstState = first[8]
    if (worstState !== 'OK')
      expect(out.summary).toMatch(/Lowest: .* stock-out \d{4}-\d{2}-\d{2}|Lowest: .*no demand/)
  })

  it('days of supply is arithmetic on the rows', () => {
    const out = renderFigure({
      kind: 'logistics_days_of_supply',
      data: {
        asOf: '2026-11-01T00:00:00Z',
        rows: [
          { item: 'A', site: 'S', onHand: 100, inbound: 50, dailyDemand: 30, reorderPointDays: 7 },
        ],
      },
    })
    expect(out.table!.rows[0]).toContain('5.0')
    expect(out.table!.rows[0]).toContain('2026-11-06')
    expect(out.table!.rows[0]).toContain('LOW')
  })

  it('temperature chart states the minutes out of range that the arithmetic gives', () => {
    const data = FIXTURES.logistics_temperature_chart as {
      low: number
      high: number
      readings: { t: string; v: number }[]
    }
    const ex = excursionSummary(
      data.readings.map((r) => ({ tMs: Date.parse(r.t), value: r.v })),
      data.low,
      data.high,
    )
    const out = renderFigure({ kind: 'logistics_temperature_chart', data })
    expect(ex.minutesOutside).toBeGreaterThan(0)
    expect(out.summary).toContain(`${ex.minutesOutside} minutes`)
    expect(out.table!.rows.some((r) => r[2] === 'NO')).toBe(true)
  })

  it('trace table marks the gaps in words', () => {
    const out = renderFigure({
      kind: 'logistics_trace_table',
      data: FIXTURES.logistics_trace_table,
    })
    expect(out.table!.rows.some((r) => r[8]!.includes('missing reference document'))).toBe(true)
    expect(out.summary).toMatch(/records have a gap/)
  })

  it('the supplier network names each status in words', () => {
    const out = renderFigure({
      kind: 'logistics_supplier_network',
      data: FIXTURES.logistics_supplier_network,
    })
    expect(out.svg).toMatch(/DOWN|OPERATING/)
    expect(out.table!.columns).toEqual(['Party', 'Tier', 'Status', 'Supplies'])
  })
})
