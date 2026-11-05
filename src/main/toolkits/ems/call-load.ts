// Dispatch call load (spec 0456 FR-9c): calls per minute with an optional surge, drawn from a mix
// of call types and priorities. Aggregate public statistics (NEMSIS dashboards) may shape the mix
// the author enters; nothing here replays real calls. Addresses are invented street names.
import { z } from 'zod'
import { createRng, type Rng } from './rng'

export const DEFAULT_MIX = [
  { type: 'Chest pain', priority: 'P1', share: 8 },
  { type: 'Difficulty breathing', priority: 'P1', share: 8 },
  { type: 'Fall, injury', priority: 'P2', share: 22 },
  { type: 'Sick person', priority: 'P3', share: 24 },
  { type: 'Motor vehicle collision', priority: 'P2', share: 10 },
  { type: 'Alarm, no fire', priority: 'P3', share: 12 },
  { type: 'Lift assist', priority: 'P3', share: 10 },
  { type: 'Structure fire', priority: 'P1', share: 6 },
] as const

const STREETS = [
  'Birch Lane',
  'Orchard Court',
  'Mill Street',
  'Cedar Court',
  'Quarry Road',
  'Harlan Road',
  'Elm Street',
  'Ridge Avenue',
]

export const CallLoadParams = z.object({
  startTime: z.string().datetime(),
  minutes: z.number().int().min(5).max(480).default(120),
  baselinePerMinute: z.number().min(0.05).max(10).default(0.4),
  surge: z
    .object({
      atMinute: z.number().min(0).max(480),
      lengthMinutes: z.number().min(1).max(240),
      multiplier: z.number().min(1).max(20),
    })
    .optional(),
  mix: z
    .array(
      z.object({
        type: z.string().min(1).max(60),
        priority: z.string().min(1).max(4),
        share: z.number().positive(),
      }),
    )
    .min(1)
    .max(20)
    .default(DEFAULT_MIX.map((m) => ({ ...m }))),
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31)
    .default(1),
})
export type CallLoadParams = z.infer<typeof CallLoadParams>

export interface SimCall {
  t: string
  type: string
  priority: string
  address: string
}

const MAX_CALLS = 5000

/** Poisson sample by Knuth's method; fine for the small rates used here. */
function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng.next()
  } while (p > limit && k < 200)
  return k - 1
}

function pickWeighted(rng: Rng, mix: CallLoadParams['mix']): CallLoadParams['mix'][number] {
  const total = mix.reduce((a, m) => a + m.share, 0)
  let r = rng.next() * total
  for (const m of mix) {
    r -= m.share
    if (r <= 0) return m
  }
  return mix[mix.length - 1]!
}

export function generateCallLoad(raw: CallLoadParams): {
  perMinute: { t: string; calls: number }[]
  calls: SimCall[]
} {
  const p = CallLoadParams.parse(raw)
  const rng = createRng(p.seed)
  const t0 = Date.parse(p.startTime)
  const perMinute: { t: string; calls: number }[] = []
  const calls: SimCall[] = []
  for (let m = 0; m < p.minutes; m++) {
    const inSurge = p.surge && m >= p.surge.atMinute && m < p.surge.atMinute + p.surge.lengthMinutes
    const n = poisson(rng, p.baselinePerMinute * (inSurge ? p.surge!.multiplier : 1))
    perMinute.push({ t: new Date(t0 + m * 60_000).toISOString(), calls: n })
    for (let i = 0; i < n && calls.length < MAX_CALLS; i++) {
      const c = pickWeighted(rng, p.mix)
      calls.push({
        t: new Date(t0 + m * 60_000 + rng.int(0, 59) * 1000).toISOString(),
        type: c.type,
        priority: c.priority,
        address: `${rng.int(2, 480)} ${rng.pick(STREETS)}`,
      })
    }
  }
  return { perMinute, calls }
}
