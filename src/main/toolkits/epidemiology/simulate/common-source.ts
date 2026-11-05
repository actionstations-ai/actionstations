// Common-source outbreak generator (spec 0457 FR-7): an event, the foods served, one true
// vehicle, and a line list, curve and attack-rate tables that let a team find it.
//
// Model: each attendee eats each food independently with the food's served fraction; for a
// food that `trails` the vehicle (a companion dish) the chance of eating it rises when the
// person ate the vehicle, which makes a plausible distractor. A person who ate the vehicle falls
// ill with `attackRateIfAte`, anyone else with `baselineAttackRate`. Exposure is a uniform time
// during the event; onset is exposure plus a lognormal incubation clamped to the pathogen's
// range; the report date follows onset by a lognormal delay. A fraction of cases is laboratory
// confirmed, the rest are probable (ate the vehicle) or suspect (did not).
import { z } from 'zod'
import { HOUR_MS, association, pathogenById, type TwoByTwo } from '@shared/epidemiology/arithmetic'
import { fictionalName, makeRng } from './rng'

const FoodSpec = z.object({
  name: z.string().min(1).max(60),
  servedFraction: z.number().min(0).max(1),
  /** 0 (independent) to 1 (eaten by almost everyone who ate the vehicle). Ignored for the vehicle itself. */
  trailsVehicle: z.number().min(0).max(1).default(0),
})

export const CommonSourceParams = z
  .object({
    seed: z.number().int().default(1),
    attendees: z.number().int().min(10).max(5000).default(120),
    eventStart: z.iso.datetime().default('2026-10-17T18:00:00Z'),
    eventHours: z.number().min(0.5).max(72).default(5),
    pathogenId: z.string().default('norovirus'),
    foods: z
      .array(FoodSpec)
      .min(2)
      .max(20)
      .default([
        { name: 'chicken salad', servedFraction: 0.7, trailsVehicle: 0 },
        { name: 'wedding cake', servedFraction: 0.85, trailsVehicle: 0.5 },
        { name: 'green salad', servedFraction: 0.6, trailsVehicle: 0 },
        { name: 'fruit punch', servedFraction: 0.75, trailsVehicle: 0.4 },
        { name: 'dinner rolls', servedFraction: 0.9, trailsVehicle: 0 },
      ]),
    vehicle: z.string().default('chicken salad'),
    attackRateIfAte: z.number().min(0).max(1).default(0.55),
    baselineAttackRate: z.number().min(0).max(1).default(0.03),
    incubationSigma: z.number().min(0.01).max(1.5).default(0.35),
    reportDelayMedianHours: z.number().min(0).max(240).default(30),
    labConfirmedFraction: z.number().min(0).max(1).default(0.25),
  })
  .refine((p) => p.foods.some((f) => f.name === p.vehicle), {
    message: 'the vehicle must be one of the foods',
    path: ['vehicle'],
  })
  .refine((p) => pathogenById(p.pathogenId) !== undefined, {
    message: 'unknown pathogen',
    path: ['pathogenId'],
  })
export type CommonSourceParams = z.input<typeof CommonSourceParams>

export type CaseStatus = 'confirmed' | 'probable' | 'suspect'

export interface Attendee {
  code: string
  /** Fictional. */
  name: string
  age: number
  sex: 'F' | 'M'
  ate: Record<string, boolean>
  ill: boolean
  exposureMs?: number
  onsetMs?: number
  reportedMs?: number
  status?: CaseStatus
}

export interface FoodAssociation extends TwoByTwo {
  food: string
  attackRateExposed: number | null
  attackRateUnexposed: number | null
  relativeRisk: number | null
  oddsRatio: number | null
  oddsRatioCi: [number, number] | null
}

export interface CommonSourceOutbreak {
  attendees: Attendee[]
  vehicle: string
  cases: Attendee[]
  /** One row per food, in the order given. */
  associations: FoodAssociation[]
}

function drawAttendee(
  i: number,
  p: z.output<typeof CommonSourceParams>,
  rngSeed: number,
): Attendee {
  // A per-person stream keeps one person's draws independent of the order of the others.
  const rng = makeRng((rngSeed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)
  const ate: Record<string, boolean> = {}
  const veh = p.foods.find((f) => f.name === p.vehicle)!
  ate[veh.name] = rng.chance(veh.servedFraction)
  for (const f of p.foods) {
    if (f.name === veh.name) continue
    const pEat = ate[veh.name]
      ? Math.min(1, f.servedFraction + f.trailsVehicle * (1 - f.servedFraction))
      : f.servedFraction * (1 - f.trailsVehicle * 0.5)
    ate[f.name] = rng.chance(pEat)
  }
  return {
    code: `A${String(i + 1).padStart(3, '0')}`,
    name: fictionalName(rng),
    age: 4 + rng.int(80),
    sex: rng.chance(0.5) ? 'F' : 'M',
    ate,
    ill: false,
  }
}

export function generateCommonSource(raw: CommonSourceParams = {}): CommonSourceOutbreak {
  const p = CommonSourceParams.parse(raw)
  const pathogen = pathogenById(p.pathogenId)!
  const start = Date.parse(p.eventStart)
  const mid = Math.sqrt(pathogen.incubationHours.min * pathogen.incubationHours.max)
  const attendees: Attendee[] = []
  for (let i = 0; i < p.attendees; i++) {
    const a = drawAttendee(i, p, p.seed)
    const rng = makeRng((p.seed ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0)
    a.ill = rng.chance(a.ate[p.vehicle] ? p.attackRateIfAte : p.baselineAttackRate)
    if (a.ill) {
      const incubationH = Math.min(
        pathogen.incubationHours.max,
        Math.max(pathogen.incubationHours.min, rng.lognormal(mid, p.incubationSigma)),
      )
      a.exposureMs = start + rng.uniform(0, p.eventHours) * HOUR_MS
      a.onsetMs = a.exposureMs + incubationH * HOUR_MS
      a.reportedMs =
        a.onsetMs + rng.lognormal(Math.max(0.5, p.reportDelayMedianHours), 0.5) * HOUR_MS
      a.status = rng.chance(p.labConfirmedFraction)
        ? 'confirmed'
        : a.ate[p.vehicle]
          ? 'probable'
          : 'suspect'
    }
    attendees.push(a)
  }
  const associations = p.foods.map((f): FoodAssociation => {
    const t: TwoByTwo = { a: 0, b: 0, c: 0, d: 0 }
    for (const a of attendees) {
      if (a.ate[f.name]) {
        if (a.ill) t.a++
        else t.b++
      } else if (a.ill) t.c++
      else t.d++
    }
    return { food: f.name, ...t, ...association(t) }
  })
  return {
    attendees,
    vehicle: p.vehicle,
    cases: attendees
      .filter((a) => a.ill)
      .sort((x, y) => x.onsetMs! - y.onsetMs! || x.code.localeCompare(y.code)),
    associations,
  }
}
