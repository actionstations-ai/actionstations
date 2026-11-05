// Casualty and transport simulation (spec 0456 FR-9a): consistent fictional patients whose
// findings the chosen triage method sorts into the requested mix, a timeline of when each is
// reached, triaged, treated and transported, and hospital capacities that make some destinations
// better than others. The ground truth (`bestDestination`, `appropriateHospitals`) is what the
// destination metric scores players against. Simple parametric code, not a patient simulator.
import { z } from 'zod'
import { simulateFindings } from './findings'
import { createRng, type Rng } from './rng'
import { PEDIATRIC_AGE_LIMIT, type Findings, type TriagePriority } from './triage-methods'

const Count = z.number().int().min(0).max(200)

export const HospitalParams = z.object({
  name: z.string().min(1).max(80),
  trauma: z.boolean().default(false),
  burn: z.boolean().default(false),
  pediatric: z.boolean().default(false),
  /** Patients the hospital says it can take from this incident. */
  receiveLimit: z.number().int().min(0).max(500),
  driveMinutes: z.number().int().min(1).max(120),
})
export type HospitalParams = z.infer<typeof HospitalParams>

export const CasualtyParams = z
  .object({
    incident: z.string().min(1).max(120),
    /** When the call came in (ISO 8601). */
    startTime: z.string().datetime(),
    method: z.enum(['START', 'SALT']).default('START'),
    mix: z.object({ immediate: Count, delayed: Count, minor: Count, expectant: Count }),
    childShare: z.number().min(0).max(1).default(0.15),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 31)
      .default(1),
    /** Minutes from the call to the first unit on scene. */
    firstUnitMinutes: z.number().min(1).max(60).default(8),
    secondsPerPatient: z.number().min(10).max(300).default(40),
    hospitals: z.array(HospitalParams).min(1).max(12),
    /** Ambulances and when each arrives, in minutes after the call. */
    ambulances: z
      .array(
        z.object({ unit: z.string().min(1).max(30), arriveMinutes: z.number().min(1).max(240) }),
      )
      .min(1)
      .max(40),
  })
  .refine((p) => p.mix.immediate + p.mix.delayed + p.mix.minor + p.mix.expectant > 0, {
    message: 'the mix needs at least one patient',
    path: ['mix'],
  })
export type CasualtyParams = z.infer<typeof CasualtyParams>

export interface SimPatient {
  id: string
  ageYears: number
  sex: 'F' | 'M'
  priority: TriagePriority
  injuries: string
  findings: Findings
  reachedAt: string
  triagedAt: string
  treatedAt: string
  /** Departure time and unit; the same priority order a good Medical Group would use. */
  transportAt: string
  transportUnit: string
  bestDestination: string
  /** Hospitals whose capability fits the injuries, ignoring how full they are. */
  appropriateHospitals: string[]
  /** True when no capable hospital had room left. */
  capacityShortfall: boolean
}

export interface CasualtyResult {
  patients: SimPatient[]
  triageCompleteAt: string
  hospitalReceived: Record<string, number>
  /** Cumulative tags by priority at each triage time. */
  counts: {
    t: string
    immediate: number
    delayed: number
    minor: number
    expectant: number
    deceased: number
  }[]
}

const MIN = 60_000
const PRIORITY_ORDER: TriagePriority[] = ['Immediate', 'Delayed', 'Minor', 'Expectant', 'Deceased']
const iso = (ms: number): string => new Date(ms).toISOString()

function makePatients(p: CasualtyParams, rng: Rng) {
  const targets = (
    [
      ['Immediate', p.mix.immediate],
      ['Delayed', p.mix.delayed],
      ['Minor', p.mix.minor],
      ['Expectant', p.mix.expectant],
    ] as const
  ).flatMap(([pri, n]) => Array.from({ length: n }, () => pri))
  return rng.shuffle(targets).map((priority) => {
    const child = rng.next() < p.childShare
    const age = child ? rng.int(2, PEDIATRIC_AGE_LIMIT - 1) : rng.int(18, 80)
    const sim = simulateFindings(priority, p.method, age, rng)
    return { priority, age, sex: rng.pick(['F', 'M'] as const), ...sim }
  })
}

const capable = (
  h: HospitalParams,
  pri: TriagePriority,
  child: boolean,
  burn: boolean,
): boolean => {
  if (pri !== 'Immediate') return true
  if (child) return h.pediatric
  return burn ? h.burn : h.trauma
}

function chooseDestination(
  hospitals: HospitalParams[],
  received: Record<string, number>,
  pri: TriagePriority,
  child: boolean,
  burn: boolean,
): { name: string; shortfall: boolean } {
  const fits = hospitals.filter((h) => capable(h, pri, child, burn))
  const open = fits.filter((h) => (received[h.name] ?? 0) < h.receiveLimit)
  // Keep trauma centers free for patients who need them.
  const prefer =
    pri === 'Immediate' ? open : open.filter((h) => !h.trauma || open.every((o) => o.trauma))
  const pool = prefer.length ? prefer : open
  if (pool.length)
    return {
      name: [...pool].sort((a, b) => a.driveMinutes - b.driveMinutes)[0]!.name,
      shortfall: false,
    }
  const any = fits.length ? fits : hospitals
  return {
    name: [...any].sort((a, b) => a.driveMinutes - b.driveMinutes)[0]!.name,
    shortfall: true,
  }
}

export function generateCasualties(raw: CasualtyParams): CasualtyResult {
  const p = CasualtyParams.parse(raw)
  const rng = createRng(p.seed)
  const t0 = Date.parse(p.startTime)
  const sims = makePatients(p, rng)
  // Walkers are called to one area first; the rest are reached one after another.
  const minors = sims.filter((s) => s.priority === 'Minor')
  const others = sims.filter((s) => s.priority !== 'Minor')
  const first = t0 + p.firstUnitMinutes * MIN
  const walkersDone = first + Math.ceil(minors.length / 6) * MIN
  const reachedAt = [
    ...minors.map((_, i) => first + (i % 6) * 10_000),
    ...others.map((_, i) => walkersDone + i * p.secondsPerPatient * 1000),
  ]
  const timed: Timed[] = [...minors, ...others].map((s, i) => {
    const reached = reachedAt[i]!
    const triaged = reached + rng.int(20, 45) * 1000
    return { ...s, reached, triaged, treated: triaged + rng.int(4, 9) * MIN }
  })
  const patients = scheduleTransport(p, timed, rng)
  const triageComplete = Math.max(...timed.map((s) => s.triaged))
  return {
    patients,
    triageCompleteAt: iso(triageComplete),
    hospitalReceived: patients.reduce<Record<string, number>>(
      (acc, x) => ({ ...acc, [x.bestDestination]: (acc[x.bestDestination] ?? 0) + 1 }),
      {},
    ),
    counts: countsOver(patients),
  }
}

interface Timed {
  priority: TriagePriority
  age: number
  sex: 'F' | 'M'
  findings: Findings
  injuries: string
  reached: number
  triaged: number
  treated: number
}

function scheduleTransport(p: CasualtyParams, timed: Timed[], rng: Rng): SimPatient[] {
  const t0 = Date.parse(p.startTime)
  const fleet = p.ambulances.map((a) => ({
    unit: a.unit,
    freeAt: t0 + (a.arriveMinutes + 5) * MIN,
  }))
  const received: Record<string, number> = {}
  const byTag = timed.map((s, i) => ({ s, id: `T-${String(i + 1).padStart(3, '0')}` }))
  const queue = [...byTag].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.s.priority) - PRIORITY_ORDER.indexOf(b.s.priority) ||
      a.id.localeCompare(b.id),
  )
  const out = new Map<string, SimPatient>()
  for (const { s, id } of queue) {
    const child = s.age < PEDIATRIC_AGE_LIMIT
    const burn = /burn/i.test(s.injuries)
    const dest = chooseDestination(p.hospitals, received, s.priority, child, burn)
    received[dest.name] = (received[dest.name] ?? 0) + 1
    const hosp = p.hospitals.find((h) => h.name === dest.name)!
    const unit = fleet.reduce((a, b) => (b.freeAt < a.freeAt ? b : a))
    const leaves = Math.max(unit.freeAt, s.treated)
    const turnaround = rng.int(12, 20)
    unit.freeAt = leaves + (2 * hosp.driveMinutes + turnaround) * MIN
    out.set(id, {
      id,
      ageYears: s.age,
      sex: s.sex,
      priority: s.priority,
      injuries: s.injuries,
      findings: s.findings,
      reachedAt: iso(s.reached),
      triagedAt: iso(s.triaged),
      treatedAt: iso(s.treated),
      transportAt: iso(leaves),
      transportUnit: unit.unit,
      bestDestination: dest.name,
      appropriateHospitals: p.hospitals
        .filter((h) => capable(h, s.priority, child, burn))
        .map((h) => h.name),
      capacityShortfall: dest.shortfall,
    })
  }
  return byTag.map(({ id }) => out.get(id)!)
}

function countsOver(patients: SimPatient[]): CasualtyResult['counts'] {
  const times = [...new Set(patients.map((x) => x.triagedAt))].sort()
  return times.map((t) => {
    const upTo = patients.filter((x) => x.triagedAt <= t)
    const n = (pri: TriagePriority): number => upTo.filter((x) => x.priority === pri).length
    return {
      t,
      immediate: n('Immediate'),
      delayed: n('Delayed'),
      minor: n('Minor'),
      expectant: n('Expectant'),
      deceased: n('Deceased'),
    }
  })
}
