// The logistics simulations (#808, #804): deterministic, labeled simulated, stock never negative,
// shipments reconcile, the disruption shows in the series and events, and the trace finds every
// planted gap.
import { describe, expect, it } from 'vitest'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { LOGISTICS_GENERATORS, networkEvents } from './generators'
import { simulateNetwork, zoneName } from './network'
import { generateTraceRecords } from './trace-records'
import { traceLot } from '../trace'

const gen = (id: string) => LOGISTICS_GENERATORS.find((g) => g.id === id)!

describe('simulated supply network', () => {
  const n = simulateNetwork({ seed: 4 })

  it('is deterministic for a seed and differs between seeds', () => {
    expect(simulateNetwork({ seed: 4 }).daily).toEqual(n.daily)
    expect(simulateNetwork({ seed: 5 }).daily).not.toEqual(n.daily)
  })

  it('never lets stock go negative and counts unmet demand as shortfall', () => {
    for (const d of n.daily) {
      expect(d.onHand).toBeGreaterThanOrEqual(0)
      expect(d.shortfall).toBeGreaterThanOrEqual(0)
    }
  })

  it('counts days of supply from stock on hand only, not stock still in transit', () => {
    const withInbound = n.daily.filter((d) => d.inbound > 0 && d.demand > 0)
    expect(withInbound.length).toBeGreaterThan(0)
    for (const d of withInbound) expect(d.days).toBeCloseTo(d.onHand / d.demand, 9)
  })

  it('reconciles each order: placed, in transit, then received, never both', () => {
    const last = n.params.days - 1
    for (const o of n.orders) {
      const arrived = o.arrivalDay !== null && o.arrivalDay <= last
      const inTransit = o.arrivalDay !== null && o.arrivalDay > last
      const lost = o.arrivalDay === null
      expect([arrived, inTransit, lost].filter(Boolean)).toHaveLength(1)
      expect(o.quantity).toBeGreaterThanOrEqual(0)
    }
  })

  it('takes the failed supplier down for the window and runs the first item short', () => {
    const failed = n.suppliers.find((s) => s.id === n.disruptedSupplierId)!
    expect(failed.status[n.params.disruptionDay]).toBe('down')
    expect(failed.status[n.params.disruptionDay + n.params.disruptionDays]).toBe('operating')
    const first = n.items[0]!.name
    expect([...n.stockOutDay.keys()].some((k) => k.startsWith(first))).toBe(true)
    const calm = simulateNetwork({ seed: 4, disruption: 'none' })
    expect(calm.stockOutDay.size).toBe(0)
  })

  it('delays arrivals to one center for a lane disruption', () => {
    const lane = simulateNetwork({ seed: 4, disruption: 'lane_disruption' })
    const slipped = lane.orders.filter((o) => o.arrivalDay !== null && o.arrivalDay > o.plannedDay)
    expect(slipped.length).toBeGreaterThan(0)
    expect(slipped.every((o) => o.center === lane.disruptedCenter)).toBe(true)
  })
})

describe('network generator output', () => {
  const out = gen('logistics-network').generate({ seed: 4 } as never)

  it('writes a modeled series per item and center and ground-truth events that validate', () => {
    const series = out.find((d) => d.shape === 'modeled-series')!
    const events = out.find((d) => d.shape === 'ground-truth')!
    const parsedSeries = (series.data as unknown[]).map((s) => ModeledSeries.parse(s))
    expect(parsedSeries).toHaveLength(3 * 2)
    expect(parsedSeries.map((s) => s.zone)).toContain(zoneName('Series 7 motor kit', 'DC Lindgren'))
    for (const e of events.data as unknown[]) GroundTruthEvent.parse(e)
  })

  it('labels every dataset simulated', () => {
    for (const d of out) expect(d.label.toLowerCase()).toContain('simulated')
  })

  it('records the supplier failure and the first stock-out as events', () => {
    const kinds = networkEvents(simulateNetwork({ seed: 4 })).map((e) => e.kind)
    expect(kinds).toContain('supplier_failed')
    expect(kinds).toContain('supplier_restarted')
    expect(kinds).toContain('stock_out')
  })
})

describe('simulated traceability records', () => {
  const set = generateTraceRecords({ seed: 2 })
  const result = traceLot(set.records, set.lot)

  it('reaches every customer except those behind the unrecorded repack', () => {
    const shipTo = new Set(result.rows.map((r) => r.shipTo))
    for (const c of set.customersReached) expect(shipTo.has(c)).toBe(true)
    for (const c of set.customersViaRepack) expect(shipTo.has(c)).toBe(false)
  })

  it('finds the planted gaps and nothing else', () => {
    const missing = result.rows.filter((r) => r.gap).map((r) => r.shipTo)
    expect(missing.sort()).toEqual([...set.planted.missingReferenceShipments].sort())
    expect(result.suspects.map((r) => r.shipTo).sort()).toEqual([...set.customersViaRepack].sort())
    expect(result.gaps).toBe(missing.length + set.customersViaRepack.length)
  })

  it('follows the recorded transformation from the farm lot', () => {
    const farm = set.records.find((r) => r.cte === 'receiving')!
    expect(traceLot(set.records, farm.lot).rows.length).toBe(result.rows.length)
  })

  it('is complete when nothing is planted', () => {
    const clean = generateTraceRecords({ seed: 2, missingReferences: 0, unrecordedRepack: false })
    const r = traceLot(clean.records, clean.lot)
    expect(r.gaps).toBe(0)
    expect(r.accounts).toBe(3 + 24)
  })

  it('writes ground truth the metrics can score the trace against', () => {
    const out = gen('logistics-trace').generate({ seed: 2 } as never)
    const truth = (
      out.find((d) => d.shape === 'ground-truth')!.data as {
        kind: string
        attrs: Record<string, number>
      }[]
    ).find((e) => e.kind === 'trace_answer')!
    expect(truth.attrs.accounts).toBe(result.accounts)
    expect(truth.attrs.gaps).toBe(result.gaps)
  })
})
