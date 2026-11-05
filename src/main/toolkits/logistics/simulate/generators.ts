// The logistics simulations as case-data generators (spec 0448 FR-10, spec 0462 FR-8). Each is a
// pure function of its parameters; the framework labels the output simulated, so none of it can
// pass as historical. Every label also says simulated. The ground-truth events and the modeled
// series written here are what the logistics metrics read.
import type { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { dayIso, NetworkParams, simulateNetwork, zoneName, type SupplyNetwork } from './network'
import { generateTraceRecords, TraceParams } from './trace-records'
import { traceLot } from '../trace'

type Event = {
  id: string
  time: string
  kind: string
  area?: string
  attrs: Record<string, unknown>
}

/** The ground-truth events of a simulated network: disruption start and end, first stock-out, first reorder breach. */
export function networkEvents(n: SupplyNetwork): Event[] {
  const p = n.params
  const events: Event[] = []
  const end = Math.min(p.days - 1, p.disruptionDay + p.disruptionDays)
  const failed = n.suppliers.find((s) => s.id === n.disruptedSupplierId)
  if (failed)
    events.push(
      {
        id: 'supplier-failed',
        time: dayIso(n, p.disruptionDay),
        kind: 'supplier_failed',
        area: failed.label,
        attrs: { supplier: failed.label, severity: p.severity },
      },
      {
        id: 'supplier-restarted',
        time: dayIso(n, end),
        kind: 'supplier_restarted',
        area: failed.label,
        attrs: { supplier: failed.label },
      },
    )
  if (n.disruptedCenter)
    events.push(
      {
        id: 'lane-closed',
        time: dayIso(n, p.disruptionDay),
        kind: 'lane_closed',
        area: n.disruptedCenter,
        attrs: { center: n.disruptedCenter },
      },
      {
        id: 'lane-reopened',
        time: dayIso(n, end),
        kind: 'lane_reopened',
        area: n.disruptedCenter,
        attrs: { center: n.disruptedCenter },
      },
    )
  for (const [zone, day] of [...n.belowReorderDay].sort(
    (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
  ))
    events.push({
      id: `below-reorder-${zone}`,
      time: dayIso(n, day),
      kind: 'below_reorder',
      area: zone,
      attrs: { zone },
    })
  for (const [zone, day] of [...n.stockOutDay].sort(
    (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
  ))
    events.push({
      id: `stock-out-${zone}`,
      time: dayIso(n, day),
      kind: 'stock_out',
      area: zone,
      attrs: { zone },
    })
  return events
}

const networkGenerator: SimulatedGenerator<z.output<typeof NetworkParams>> = {
  id: 'logistics-network',
  label: 'Simulated supply network and disruption',
  params: NetworkParams,
  generate(raw) {
    const n = simulateNetwork(raw)
    const zones = n.items.flatMap((it) => n.centers.map((c) => zoneName(it.name, c)))
    const range = { start: dayIso(n, 0), end: dayIso(n, n.params.days - 1) }
    const out: GeneratedDataset[] = [
      {
        id: 'logistics-days-of-supply',
        label: 'Days of supply on hand by item and center, simulated',
        kind: 'series',
        shape: 'modeled-series',
        range,
        unit: 'days',
        data: zones.map((zone) => ({
          zone,
          quantity: 'days_of_supply',
          points: n.daily
            .filter((d) => zoneName(d.item, d.center) === zone)
            .map((d) => ({
              time: dayIso(n, d.day),
              // On hand only: stock that has not arrived does not protect against a stock-out.
              value: d.demand > 0 ? Math.round((d.onHand / d.demand) * 100) / 100 : 0,
            })),
        })),
      },
      {
        id: 'logistics-events',
        label: 'Supply network events (ground truth), simulated',
        kind: 'reports',
        shape: 'ground-truth',
        range,
        data: networkEvents(n),
      },
    ]
    return out
  },
}

const traceGenerator: SimulatedGenerator<z.output<typeof TraceParams>> = {
  id: 'logistics-trace',
  label: 'Simulated traceability records for a food lot',
  params: TraceParams,
  generate(raw) {
    const set = generateTraceRecords(raw)
    const t0 = Date.parse(TraceParams.parse(raw).startDate)
    const signal = new Date(t0 + 4 * 86_400_000).toISOString()
    const truth = traceLot(set.records, set.lot)
    const dateOf = (r: (typeof set.records)[number]): string =>
      r.cte === 'shipping' ? r.shipDate : r.cte === 'receiving' ? r.receiveDate : r.date
    return [
      {
        id: 'logistics-trace-records',
        label: 'Traceability records (shipping, receiving, transformation), simulated',
        kind: 'reports',
        data: set.records.map((r) => ({
          t: dateOf(r),
          title: `${r.cte} ${r.lot}`,
          text: JSON.stringify(r),
        })),
      },
      {
        id: 'logistics-trace-events',
        label: 'Recall signal and trace answer (ground truth), simulated',
        kind: 'reports',
        shape: 'ground-truth',
        data: [
          {
            id: 'recall-signal',
            time: signal,
            kind: 'recall_signal',
            area: set.lot,
            attrs: { lot: set.lot },
          },
          {
            id: 'trace-answer',
            time: signal,
            kind: 'trace_answer',
            area: set.lot,
            attrs: {
              lot: set.lot,
              accounts: truth.accounts,
              gaps: truth.gaps,
              customersReached: set.customersReached.length,
              customersViaRepack: set.customersViaRepack.length,
            },
          },
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

export const LOGISTICS_GENERATORS: readonly SimulatedGenerator<never>[] = [
  networkGenerator,
  traceGenerator,
] as unknown as readonly SimulatedGenerator<never>[]
