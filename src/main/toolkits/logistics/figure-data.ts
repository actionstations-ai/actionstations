// Figure data built from the simulations (spec 0462 FR-5, FR-8): the glue between a simulated
// network or trace and the logistics figure kinds, so an inject's figure always agrees with the
// records it came from. Pure functions; the output is plain JSON for `fields.figures.<name>.data`.
import type { TraceResult } from './trace'
import { dayIso, type SupplyNetwork } from './simulate/network'

const dayOf = (n: SupplyNetwork, d: number): string => dayIso(n, d)

/** Days-of-supply rows for every item and center at the end of `day`. */
export function daysOfSupplyData(
  n: SupplyNetwork,
  day: number,
  title?: string,
): Record<string, unknown> {
  return {
    ...(title ? { title } : {}),
    asOf: dayOf(n, day),
    rows: n.daily
      .filter((d) => d.day === day)
      .map((d) => ({
        item: d.item,
        site: d.center,
        unit: 'units',
        onHand: d.onHand,
        inbound: d.inbound,
        dailyDemand: d.demand,
        reorderPointDays: n.reorderDays.get(d.item) ?? 10,
      })),
  }
}

/** Shipments open at the end of `day`: placed, not yet arrived; slipped ones are marked delayed. */
export function shipmentTrackerData(
  n: SupplyNetwork,
  day: number,
  title?: string,
): Record<string, unknown> {
  const label = new Map(n.suppliers.map((s) => [s.id, s.label]))
  const open = n.orders.filter(
    (o) => o.placedDay <= day && (o.arrivalDay === null || o.arrivalDay > day),
  )
  return {
    ...(title ? { title } : {}),
    asOf: dayOf(n, day),
    rows: open.slice(0, 60).map((o) => {
      const lost = o.arrivalDay === null
      const slipped = !lost && o.arrivalDay! > o.plannedDay
      const current = lost ? o.plannedDay + n.params.disruptionDays : o.arrivalDay!
      return {
        shipment: o.id,
        lane: `${label.get(o.supplierId)} to ${o.center}`,
        carrier: o.carrier,
        equipment: `Trailer ${o.id.slice(3)}`,
        etaPlanned: dayOf(n, o.plannedDay),
        etaCurrent: dayOf(n, current),
        status: lost
          ? 'held'
          : slipped
            ? 'delayed'
            : o.plannedDay - day <= 1
              ? 'at_risk'
              : 'on_time',
        exception: lost ? 'Supplier did not ship' : slipped ? 'Lane disruption' : '',
      }
    }),
  }
}

/** The supplier network drawn with each supplier's status on `day`. */
export function supplierNetworkData(
  n: SupplyNetwork,
  day: number,
  title?: string,
): Record<string, unknown> {
  return {
    ...(title ? { title } : {}),
    nodes: [
      { id: 'CO', label: 'Company', tier: 0, status: 'operating' },
      ...n.suppliers.map((s) => ({
        id: s.id,
        label: s.label,
        tier: s.tier,
        status: s.status[Math.min(day, s.status.length - 1)],
      })),
    ],
    edges: [...n.edges, ...n.items.map((it) => ({ from: it.supplierId, to: 'CO' }))],
  }
}

/** The trace lookup result as a trace table figure's data. */
export function traceTableData(t: TraceResult, title?: string): Record<string, unknown> {
  const all = [...t.rows, ...t.suspects]
  return {
    ...(title ? { title } : {}),
    lot: t.lot,
    rows: all.map((r) => ({
      shipTo: r.shipTo,
      location: r.shipTo === r.shipFrom ? '' : `from ${r.shipFrom}`,
      quantity: r.quantity,
      unit: r.unit,
      shipDate: r.shipDate,
      product: r.product,
      reference: r.reference,
      ...(r.onHand === undefined ? {} : { onHand: r.onHand }),
      gap: r.gap,
    })),
  }
}

/** A cold room record that rises out of range at `startMinute` and returns after `durationMin`. */
export function temperatureChartData(opts: {
  startDate: string
  low: number
  high: number
  peak: number
  startMinute: number
  durationMin: number
  title?: string
}): Record<string, unknown> {
  const t0 = Date.parse(opts.startDate)
  const mid = (low: number, high: number): number => (low + high) / 2
  const readings = Array.from({ length: 49 }, (_, i) => {
    const minute = i * 15
    const into = minute - opts.startMinute
    const inside = into >= 0 && into <= opts.durationMin
    const frac = inside ? 1 - Math.abs((into - opts.durationMin / 2) / (opts.durationMin / 2)) : 0
    const v = mid(opts.low, opts.high) + frac * (opts.peak - mid(opts.low, opts.high))
    return { t: new Date(t0 + minute * 60_000).toISOString(), v: Math.round(v * 10) / 10 }
  })
  return {
    ...(opts.title ? { title: opts.title } : {}),
    unit: '°C',
    low: opts.low,
    high: opts.high,
    readings,
  }
}
