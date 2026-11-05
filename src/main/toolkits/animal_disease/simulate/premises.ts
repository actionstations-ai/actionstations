// Fictional premises for a county (spec 0460 FR-7): species and head counts consistent with a
// county farm inventory, placed as points around a few hubs. Names are made up, codes are
// sequential, and nothing is placed at a real farm. All of it is simulated.
import { z } from 'zod'
import { makeRng } from '../../epidemiology/simulate/rng'
import { fromLocalKm, type LatLon } from '../geo'

export const InventoryLine = z.object({
  species: z.string().min(1).max(40),
  farms: z.number().int().min(0).max(500),
  meanHead: z.number().positive().max(1_000_000),
})
export type InventoryLine = z.infer<typeof InventoryLine>

export const DEFAULT_INVENTORY: InventoryLine[] = [
  { species: 'turkeys', farms: 14, meanHead: 30000 },
  { species: 'layers', farms: 6, meanHead: 90000 },
  { species: 'swine', farms: 25, meanHead: 2500 },
  { species: 'dairy cattle', farms: 20, meanHead: 300 },
  { species: 'backyard birds', farms: 40, meanHead: 25 },
]

export const PremisesParams = z.object({
  seed: z.number().int().default(7),
  county: z.string().min(1).max(60).default('Tamarack County'),
  center: z.object({ lat: z.number(), lon: z.number() }).default({ lat: 44.3, lon: -93.9 }),
  radiusKm: z.number().min(5).max(200).default(40),
  hubs: z.number().int().min(1).max(12).default(4),
  inventory: z.array(InventoryLine).min(1).max(12).default(DEFAULT_INVENTORY),
})
export type PremisesParams = z.input<typeof PremisesParams>

export interface Premises extends LatLon {
  /** Sequential code, P-001. The designation prefix is added when a premises is designated. */
  id: string
  /** Fictional farm name. */
  name: string
  species: string
  head: number
}

const FIRST = [
  'Birchwood',
  'Alder Run',
  'Fenwick',
  'Harbor Valley',
  'Cedar Hollow',
  'Stone Ridge',
  'Willow Bend',
  'Marsh Creek',
  'Pine Knoll',
  'Copper Field',
  'Linden',
  'Ash Grove',
  'Red Barn',
  'Quarry Hill',
  'Meadowlark',
]
const KIND: Record<string, string> = {
  turkeys: 'Turkey Complex',
  layers: 'Egg Farm',
  swine: 'Swine Farm',
  'dairy cattle': 'Dairy',
  'backyard birds': 'Backyard Flock',
}

/** Premises for the county, in code order. The same parameters give the same premises. */
export function generatePremises(raw: PremisesParams = {}): Premises[] {
  const p = PremisesParams.parse(raw)
  const rng = makeRng(p.seed)
  const hubs = Array.from({ length: p.hubs }, () => {
    const r = p.radiusKm * 0.6 * Math.sqrt(rng.next())
    const a = rng.uniform(0, 2 * Math.PI)
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
  const out: Premises[] = []
  let n = 0
  for (const line of p.inventory) {
    for (let i = 0; i < line.farms; i++) {
      const hub = rng.pick(hubs)
      let x = hub.x + rng.normal() * p.radiusKm * 0.18
      let y = hub.y + rng.normal() * p.radiusKm * 0.18
      const d = Math.hypot(x, y)
      if (d > p.radiusKm) {
        x *= p.radiusKm / d
        y *= p.radiusKm / d
      }
      const at = fromLocalKm(p.center, x, y)
      n++
      out.push({
        id: `P-${String(n).padStart(3, '0')}`,
        name: `${rng.pick(FIRST)} ${KIND[line.species] ?? 'Farm'} ${n}`,
        species: line.species,
        head: Math.max(1, Math.round(rng.lognormal(line.meanHead, 0.5))),
        lat: Math.round(at.lat * 1e5) / 1e5,
        lon: Math.round(at.lon * 1e5) / 1e5,
      })
    }
  }
  return out
}
