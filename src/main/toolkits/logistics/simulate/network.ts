// A simulated supply network and its disruptions (spec 0462 FR-8). Parametric, not a numerical
// model: each item has a single tier-1 source, a lead time and a daily demand at each distribution
// center; a reorder rule places orders; a supplier failure removes the shipments it would have
// made, and a lane disruption delays arrivals to one center. Stock never goes negative: unmet
// demand is counted as shortfall. All names are fictional.
import { z } from 'zod'
import { DAY_MS, daysOfSupply } from '@shared/logistics/arithmetic'
import { makeRng, type Rng } from './rng'

export const NetworkParams = z.object({
  seed: z.number().int().default(1),
  startDate: z.iso.datetime().default('2026-11-01T00:00:00Z'),
  days: z.number().int().min(10).max(90).default(42),
  items: z.number().int().min(1).max(5).default(3),
  centers: z.number().int().min(1).max(4).default(2),
  disruption: z.enum(['none', 'supplier_failure', 'lane_disruption']).default('supplier_failure'),
  /** Day (from 0) the disruption starts; item 1 and distribution center 1 are the ones hit. */
  disruptionDay: z.number().int().min(1).max(60).default(7),
  disruptionDays: z.number().int().min(1).max(60).default(28),
  /** Share of the failed supplier's shipments lost, 0 to 1. */
  severity: z.number().min(0).max(1).default(1),
})
export type NetworkParams = z.output<typeof NetworkParams>

const ITEMS = [
  'Series 7 motor kit',
  'Control board B12',
  'Gearbox housing',
  'Wire harness H4',
  'Compressor C20',
]
const T1 = [
  'Brightwater Motors',
  'Pinecrest Controls',
  'Lindgren Castings',
  'Eastgate Cable',
  'Marlow Compressors',
  'Cobalt Drives',
]
const T2 = [
  'Northfield Steel',
  'Redhill Copper',
  'Ashby Resin',
  'Tidewater Alloys',
  'Kestrel Semiconductors',
]
const T3 = ['Quarry Ridge Ore', 'Sable Chemicals']
const CENTERS = ['DC Lindgren', 'DC Marlow', 'DC Eastgate', 'DC Harlow']
const CARRIERS = ['Prairie Freight', 'Harbor Line', 'Summit Intermodal', 'Redbird Trucking']

export interface SimSupplier {
  id: string
  label: string
  tier: 1 | 2 | 3
  /** Status at the start of each day. */
  status: ('operating' | 'down' | 'unknown')[]
}
export interface SimItem {
  name: string
  supplierId: string
  leadDays: number
  alternateQualified: boolean
}
export interface SimOrder {
  id: string
  item: string
  center: string
  supplierId: string
  placedDay: number
  plannedDay: number
  /** The day it arrives; null when the supplier could not ship it. */
  arrivalDay: number | null
  quantity: number
  carrier: string
}
export interface SimDay {
  day: number
  item: string
  center: string
  onHand: number
  inbound: number
  demand: number
  days: number | null
  shortfall: number
}
export interface SupplyNetwork {
  params: NetworkParams
  suppliers: SimSupplier[]
  edges: { from: string; to: string }[]
  items: SimItem[]
  centers: string[]
  orders: SimOrder[]
  daily: SimDay[]
  /** The first day each item and center ran out, and the first day below the reorder point. */
  stockOutDay: Map<string, number>
  belowReorderDay: Map<string, number>
  /** Reorder point in days for each item. */
  reorderDays: Map<string, number>
  disruptedSupplierId: string | null
  disruptedCenter: string | null
}

const key = (item: string, center: string): string => `${item} @ ${center}`
export const zoneName = key

function buildStructure(p: NetworkParams, rng: Rng) {
  const t1 = Array.from({ length: p.items + 1 }, (_, i) => T1[i % T1.length]!)
  const mk = (names: string[], tier: 1 | 2 | 3, n: number): SimSupplier[] =>
    names.slice(0, n).map((label, i) => ({
      id: `T${tier}-${i + 1}`,
      label,
      tier,
      status: Array<'operating' | 'down' | 'unknown'>(p.days).fill(
        tier === 3 ? 'unknown' : 'operating',
      ),
    }))
  const suppliers = [...mk(t1, 1, t1.length), ...mk(T2, 2, p.items), ...mk(T3, 3, 2)]
  const items: SimItem[] = Array.from({ length: p.items }, (_, i) => ({
    name: ITEMS[i]!,
    supplierId: `T1-${i + 1}`,
    leadDays: rng.between(5, 12),
    alternateQualified: rng.chance(0.4),
  }))
  const edges = [
    ...items.map((it, i) => ({ from: `T2-${i + 1}`, to: it.supplierId })),
    ...items.map((_, i) => ({ from: `T3-${(i % 2) + 1}`, to: `T2-${i + 1}` })),
  ]
  return { suppliers, items, edges }
}

/** Mark the failed supplier down for the disruption window. */
function applyFailure(p: NetworkParams, suppliers: SimSupplier[]): string | null {
  if (p.disruption !== 'supplier_failure') return null
  const s = suppliers.find((x) => x.id === 'T1-1')!
  for (let d = p.disruptionDay; d < Math.min(p.days, p.disruptionDay + p.disruptionDays); d++)
    s.status[d] = 'down'
  return s.id
}

export function simulateNetwork(raw: z.input<typeof NetworkParams>): SupplyNetwork {
  const p = NetworkParams.parse(raw)
  const rng = makeRng(p.seed)
  const { suppliers, items, edges } = buildStructure(p, rng)
  const centers = CENTERS.slice(0, p.centers)
  const disruptedSupplierId = applyFailure(p, suppliers)
  const disruptedCenter = p.disruption === 'lane_disruption' ? centers[0]! : null
  const windowEnd = p.disruptionDay + p.disruptionDays
  const orders: SimOrder[] = []
  const daily: SimDay[] = []
  const stockOutDay = new Map<string, number>()
  const belowReorderDay = new Map<string, number>()
  const reorderDays = new Map(items.map((it) => [it.name, it.leadDays + 4]))
  let seq = 1
  for (const it of items) {
    for (const c of centers) {
      const demand = rng.between(80, 400)
      let onHand = demand * (it.leadDays + 9)
      const reorder = reorderDays.get(it.name)!
      const open: SimOrder[] = []
      for (let d = 0; d < p.days; d++) {
        for (const o of open) if (o.arrivalDay === d) onHand += o.quantity
        const sold = Math.min(onHand, demand)
        onHand -= sold
        const inbound = open
          .filter((o) => o.arrivalDay !== null && o.arrivalDay > d)
          .reduce((s, o) => s + o.quantity, 0)
        const days = daysOfSupply(onHand, inbound, demand)
        daily.push({
          day: d,
          item: it.name,
          center: c,
          onHand,
          inbound,
          demand,
          days,
          shortfall: demand - sold,
        })
        const k = key(it.name, c)
        if (sold < demand && !stockOutDay.has(k)) stockOutDay.set(k, d)
        if (days !== null && days < reorder && !belowReorderDay.has(k)) belowReorderDay.set(k, d)
        if (onHand + inbound < demand * reorder) {
          const o = placeOrder(
            p,
            it,
            c,
            d,
            demand,
            windowEnd,
            disruptedSupplierId,
            disruptedCenter,
            rng,
            seq++,
          )
          open.push(o)
          orders.push(o)
        }
      }
    }
  }
  return {
    params: p,
    suppliers,
    edges,
    items,
    centers,
    orders,
    daily,
    stockOutDay,
    belowReorderDay,
    reorderDays,
    disruptedSupplierId,
    disruptedCenter,
  }
}

function placeOrder(
  p: NetworkParams,
  it: SimItem,
  center: string,
  day: number,
  demand: number,
  windowEnd: number,
  failedSupplier: string | null,
  failedCenter: string | null,
  rng: Rng,
  seq: number,
): SimOrder {
  let quantity = demand * (it.leadDays + 6)
  const planned = day + it.leadDays
  let arrival: number | null = planned
  const inWindow = (d: number): boolean => d >= p.disruptionDay && d < windowEnd
  if (failedSupplier === it.supplierId && inWindow(day)) {
    quantity = Math.round(quantity * (1 - p.severity))
    if (quantity === 0) arrival = null
  }
  if (failedCenter === center && arrival !== null && (inWindow(day) || inWindow(planned)))
    arrival = Math.max(planned, windowEnd + 2)
  return {
    id: `SH-${String(seq).padStart(4, '0')}`,
    item: it.name,
    center,
    supplierId: it.supplierId,
    placedDay: day,
    plannedDay: planned,
    arrivalDay: arrival,
    quantity,
    carrier: CARRIERS[(seq + it.leadDays) % CARRIERS.length]!,
  }
}

export const dayIso = (n: SupplyNetwork, day: number): string =>
  new Date(Date.parse(n.params.startDate) + day * DAY_MS).toISOString()
