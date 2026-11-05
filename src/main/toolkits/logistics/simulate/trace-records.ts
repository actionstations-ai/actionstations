// A simulated traceability record set for one food lot (spec 0462 FR-6, FR-8): a receiving record
// at the plant, a transformation that changes the lot code format, shipments to distribution
// centers and on to customers, and planted gaps (shipments with no reference document, and one
// distribution center that repacked under a new lot code with no linking record). The planted gaps
// are returned with the records so tests and metrics know the right answer.
import { z } from 'zod'
import { DAY_MS } from '@shared/logistics/arithmetic'
import type { ShippingRecord, TraceRecord } from '../trace'
import { makeRng } from './rng'

export const TraceParams = z.object({
  seed: z.number().int().default(1),
  startDate: z.iso.datetime().default('2026-11-04T00:00:00Z'),
  centers: z.number().int().min(2).max(4).default(3),
  customers: z.number().int().min(4).max(60).default(24),
  lot: z.string().min(3).max(40).default('MLW-261104-A'),
  product: z.string().min(1).max(80).default('Spring mix, 5 oz clamshell'),
  /** Shipments left without a reference document. */
  missingReferences: z.number().int().min(0).max(10).default(2),
  /** One center repacks under a new lot code and writes no transformation record. */
  unrecordedRepack: z.boolean().default(true),
})
export type TraceParams = z.output<typeof TraceParams>

const CENTERS = ['DC Marlow', 'DC Lindgren', 'DC Eastgate', 'DC Harlow']
const STORES = [
  'Eastgate Home Stores',
  'Pinecrest Market',
  'Redhill Grocers',
  'Tidewater Foods',
  'Kestrel Fresh',
  'Ashby Co-op',
]

export interface PlantedGaps {
  missingReferenceShipments: string[]
  repackLot: string | null
  repackCenter: string | null
}

export interface TraceRecordSet {
  records: TraceRecord[]
  lot: string
  planted: PlantedGaps
  /** Ship-to names of every customer the lot (and its recorded descendants) reached. */
  customersReached: string[]
  /** Customers reached only through the unrecorded repack. */
  customersViaRepack: string[]
}

const iso = (ms: number): string => new Date(ms).toISOString()

export function generateTraceRecords(raw: z.input<typeof TraceParams>): TraceRecordSet {
  const p = TraceParams.parse(raw)
  const rng = makeRng(p.seed)
  const t0 = Date.parse(p.startDate)
  const centers = CENTERS.slice(0, p.centers)
  const farmLot = `FARM-${rng.between(1000, 9999)}-${rng.between(100, 999)}`
  const records: TraceRecord[] = [
    {
      cte: 'receiving',
      lot: farmLot,
      product: 'Leafy greens, bulk',
      quantity: 9000,
      unit: 'lb',
      location: 'Westmarch Fresh plant',
      receiveDate: iso(t0),
      reference: 'BOL-77120',
    },
    {
      cte: 'transformation',
      lot: p.lot,
      inputLots: [farmLot],
      product: p.product,
      quantity: 7200,
      unit: 'cases',
      location: 'Westmarch Fresh plant',
      date: iso(t0 + DAY_MS),
      reference: 'WO-5530',
    },
  ]
  const perCenter = Math.floor(7200 / centers.length)
  centers.forEach((c, i) =>
    records.push(
      ship(p.lot, p.product, perCenter, 'Westmarch Fresh plant', c, t0 + 2 * DAY_MS, `BOL-8${i}01`),
    ),
  )
  const repackCenter = p.unrecordedRepack ? centers[centers.length - 1]! : null
  const repackLot = repackCenter ? `RP-${rng.between(100, 999)}-1106` : null
  const reached: string[] = []
  const viaRepack: string[] = []
  for (let k = 0; k < p.customers; k++) {
    const center = centers[k % centers.length]!
    const name = `${STORES[k % STORES.length]} ${100 + k}`
    const repacked = center === repackCenter
    const qty = rng.between(10, 60)
    records.push(
      ship(
        repacked ? repackLot! : p.lot,
        p.product,
        qty,
        center,
        name,
        t0 + 3 * DAY_MS,
        `INV-${40000 + k}`,
      ),
    )
    ;(repacked ? viaRepack : reached).push(name)
  }
  const shipments = records.filter((r): r is ShippingRecord => r.cte === 'shipping')
  const candidates = shipments.filter(
    (r) => r.lot === p.lot && r.shipFrom !== 'Westmarch Fresh plant',
  )
  const missing: string[] = []
  for (let k = 0; k < Math.min(p.missingReferences, candidates.length); k++) {
    const r = candidates[(k * 7 + 3) % candidates.length]!
    if (r.reference === '') continue
    r.reference = ''
    missing.push(r.shipTo)
  }
  return {
    records,
    lot: p.lot,
    planted: { missingReferenceShipments: missing, repackLot, repackCenter },
    customersReached: reached,
    customersViaRepack: viaRepack,
  }
}

function ship(
  lot: string,
  product: string,
  quantity: number,
  shipFrom: string,
  shipTo: string,
  dateMs: number,
  reference: string,
): ShippingRecord {
  return {
    cte: 'shipping',
    lot,
    product,
    quantity,
    unit: 'cases',
    shipFrom,
    shipTo,
    shipDate: iso(dateMs),
    reference,
  }
}
