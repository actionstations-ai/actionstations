// The cold chain model (spec 0463 FR-8): a storage unit holds its setpoint until a compressor or
// power failure, then warms toward the room along an exponential curve (door openings add a short
// bump), and cools again if power returns. Product viability is read from a table of the
// scenario's FICTIONAL products: each has a highest temperature and the minutes above it the
// scenario allows. The table is exercise content, not manufacturer data or guidance. All values
// are simulated.
import { z } from 'zod'
import { minutesOutsideRange } from '../../../../shared/pharmacy/arithmetic'
import { createRng } from '../../ems/rng'

export const ProductRule = z.object({
  name: z.string().min(1).max(80),
  lot: z.string().min(1).max(30),
  doses: z.number().int().min(0).max(100_000),
  /** Highest temperature the scenario allows for this product. */
  maxC: z.number().finite(),
  /** Minutes above maxC the scenario allows before the product is not usable. */
  allowedMinutesAbove: z.number().min(0),
})
export type ProductRule = z.infer<typeof ProductRule>

export const FICTIONAL_PRODUCTS: ProductRule[] = [
  {
    name: 'Pediatric vaccine A (fictional)',
    lot: 'EX-A-4410',
    doses: 60,
    maxC: 12,
    allowedMinutesAbove: 360,
  },
  {
    name: 'Pediatric vaccine B (fictional)',
    lot: 'EX-B-1187',
    doses: 40,
    maxC: 8,
    allowedMinutesAbove: 0,
  },
  {
    name: 'Adult vaccine C (fictional)',
    lot: 'EX-C-9021',
    doses: 25,
    maxC: 10,
    allowedMinutesAbove: 120,
  },
]

export const ColdChainParams = z.object({
  startDate: z.iso.datetime().default('2026-11-08T22:00:00Z'),
  unit: z.string().min(1).max(60).default('Refrigerator R-2'),
  lowC: z.number().finite().default(2),
  highC: z.number().finite().default(8),
  setpointC: z.number().finite().default(4.2),
  ambientC: z.number().finite().default(21),
  minutes: z.number().int().min(60).max(2880).default(480),
  stepMinutes: z.number().int().min(1).max(60).default(10),
  /** Minute the unit stops cooling (a tripped breaker, a compressor failure). */
  failureMinute: z.number().int().min(0).default(240),
  /** Minute cooling returns; absent means it does not within the run. */
  restoreMinute: z.number().int().min(0).optional(),
  /** Minutes for the unit to close 63 percent of the gap to the room when not cooling. */
  warmingTimeConstantMin: z.number().positive().default(240),
  coolingTimeConstantMin: z.number().positive().default(90),
  doorOpenings: z
    .array(
      z.object({ minute: z.number().int().min(0), bumpC: z.number().min(0).max(10).default(1.5) }),
    )
    .max(30)
    .default([]),
  products: z.array(ProductRule).max(20).default(FICTIONAL_PRODUCTS),
  seed: z.number().int().default(11),
})
export type ColdChainParams = z.output<typeof ColdChainParams>

export interface ColdChainPoint {
  minute: number
  tempC: number
}

export interface Viability {
  product: string
  lot: string
  doses: number
  minutesAboveMax: number
  usable: boolean
}

export interface ColdChainRun {
  probe: ColdChainPoint[]
  maxC: number
  minC: number
  minutesOutside: number
  /** First sampled minute outside the range (when an alarm would sound). */
  firstOutOfRange: number | undefined
  viability: Viability[]
}

const round1 = (x: number): number => Math.round(x * 10) / 10

export function runColdChain(p: ColdChainParams): ColdChainRun {
  const rng = createRng(p.seed)
  const probe: ColdChainPoint[] = []
  let base = p.setpointC
  for (let m = 0; m <= p.minutes; m++) {
    const cooling = m < p.failureMinute || (p.restoreMinute !== undefined && m >= p.restoreMinute)
    const target = cooling ? p.setpointC : p.ambientC
    const tau = cooling ? p.coolingTimeConstantMin : p.warmingTimeConstantMin
    base += (target - base) * (1 - Math.exp(-1 / tau))
    if (m % p.stepMinutes !== 0 && m !== p.minutes) continue
    const door = p.doorOpenings.reduce(
      (sum, d) => (m >= d.minute ? sum + d.bumpC * Math.exp(-(m - d.minute) / 8) : sum),
      0,
    )
    const noise = (rng.next() - 0.5) * 0.2 + (cooling ? 0.25 * Math.sin(m / 55) : 0)
    probe.push({ minute: m, tempC: round1(base + door + noise) })
  }
  const series = probe.map((x) => ({ x: x.minute, tempC: x.tempC }))
  const temps = probe.map((x) => x.tempC)
  const viability = p.products.map((r): Viability => {
    const above = minutesOutsideRange(series, -1000, r.maxC)
    return {
      product: r.name,
      lot: r.lot,
      doses: r.doses,
      minutesAboveMax: Math.round(above),
      usable: above <= r.allowedMinutesAbove,
    }
  })
  return {
    probe,
    maxC: Math.max(...temps),
    minC: Math.min(...temps),
    minutesOutside: Math.round(minutesOutsideRange(series, p.lowC, p.highC)),
    firstOutOfRange: probe.find((x) => x.tempC < p.lowC || x.tempC > p.highC)?.minute,
    viability,
  }
}
