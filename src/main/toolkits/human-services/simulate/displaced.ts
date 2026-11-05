// Children in care displaced by a disaster, and how fast the agency can locate them (spec 0464
// FR-9). Each child has a placement type and a county; the hour at which the agency can confirm
// the child's location follows a logistic curve whose midpoint depends on the placement type
// (provider-held placements are faster than kinship or group homes), and a small share are never
// located inside the exercise. Children are exercise codes (C-0001). Every number is simulated.
import { z } from 'zod'
import { makeRng } from './rng'

export const PLACEMENTS = ['Foster home', 'Kinship', 'Group home', 'Other'] as const
export type Placement = (typeof PLACEMENTS)[number]
export const STATUSES = ['located', 'contacted', 'placed', 'unknown'] as const
export type ChildStatus = (typeof STATUSES)[number]

export const DisplacedParams = z.object({
  seed: z.number().int().default(1),
  startTime: z.iso.datetime().default('2026-11-04T08:00:00Z'),
  children: z.number().int().min(5).max(5000).default(86),
  /** Share of children in each placement type, in the order Foster home, Kinship, Group home, Other. */
  placementMix: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .default([0.5, 0.25, 0.15, 0.1]),
  counties: z.array(z.string().min(1).max(40)).min(1).max(8).default(['Bayfront', 'Ridge']),
  /** Hour when half the located children are located, for a foster home. */
  midpointHours: z.number().min(1).max(240).default(20),
  /** Share never located within the run. */
  neverLocatedShare: z.number().min(0).max(1).default(0.06),
  hours: z.number().min(6).max(240).default(72),
})
export type DisplacedParams = z.output<typeof DisplacedParams>

const SPEED: Record<Placement, number> = {
  'Foster home': 1,
  Kinship: 1.4,
  'Group home': 0.8,
  Other: 1.8,
}

export interface DisplacedChild {
  code: string
  placement: Placement
  county: string
  /** Hour when the agency can confirm the location; undefined when never located. */
  locatedHour?: number
  /** Whether the child is then placed with a new caregiver, contacted only, or located in place. */
  outcome: 'located' | 'contacted' | 'placed'
}

export interface DisplacedRun {
  params: DisplacedParams
  children: DisplacedChild[]
}

export function runDisplaced(raw: z.input<typeof DisplacedParams>): DisplacedRun {
  const p = DisplacedParams.parse(raw)
  const rng = makeRng(p.seed)
  const children: DisplacedChild[] = Array.from({ length: p.children }, (_, i) => {
    const placement = PLACEMENTS[rng.weighted(p.placementMix)]!
    const never = rng.chance(p.neverLocatedShare)
    const mid = p.midpointHours * SPEED[placement]
    const hour = Math.max(0.5, mid + rng.normal() * (mid * 0.45))
    const r = rng.next()
    return {
      code: `C-${String(i + 1).padStart(4, '0')}`,
      placement,
      county: p.counties[Math.floor(rng.next() * p.counties.length)]!,
      ...(never ? {} : { locatedHour: Math.round(hour * 10) / 10 }),
      outcome: r < 0.7 ? 'located' : r < 0.9 ? 'contacted' : 'placed',
    }
  })
  return { params: p, children }
}

/** The status of a child at an hour: unknown until located, then its outcome. */
export function statusAt(c: DisplacedChild, hour: number): ChildStatus {
  return c.locatedHour !== undefined && c.locatedHour <= hour ? c.outcome : 'unknown'
}

export interface StatusCounts {
  located: number
  contacted: number
  placed: number
  unknown: number
}

export function countsAt(run: DisplacedRun, hour: number): Record<Placement, StatusCounts> {
  const out = Object.fromEntries(
    PLACEMENTS.map((pl) => [pl, { located: 0, contacted: 0, placed: 0, unknown: 0 }]),
  ) as Record<Placement, StatusCounts>
  for (const c of run.children) out[c.placement][statusAt(c, hour)]++
  return out
}
