// Simulated guest emergencies (spec 0470 FR-8): a muster with a planted number of unaccounted
// persons, a hurricane approach with property and departure timelines, a fire on one floor of a
// tower with guests accounted for floor by floor, and a cyber outage of reservations and
// keycards. Parametric and seeded; persons are codes, never names.
import { z } from 'zod'
import { makeRng } from '../../epidemiology/simulate/rng'

// ---- muster -------------------------------------------------------------------------------

export const MusterParams = z.object({
  seed: z.number().int().default(1),
  start: z.iso.datetime().default('2026-11-03T20:30:00Z'),
  passengers: z.number().int().min(10).max(10_000).default(2410),
  crew: z.number().int().min(5).max(4_000).default(980),
  /** Persons who do not reach a station on their own and are found later. */
  unaccountedPassengers: z.number().int().min(0).max(500).default(22),
  unaccountedCrew: z.number().int().min(0).max(200).default(9),
  /** The last person is found this many minutes after the alarm at the latest. */
  lastFoundMin: z.number().int().min(30).max(240).default(75),
})
export type MusterParams = z.input<typeof MusterParams>

export interface MusterPerson {
  code: string
  group: 'passengers' | 'crew'
  /** Minutes after the alarm when the person is counted at a station. */
  countedMin: number
  planted: boolean
  location: string
}

export interface MusterSim {
  params: z.output<typeof MusterParams>
  startMs: number
  people: MusterPerson[]
  /** The minute the last person is counted. */
  completeMin: number
}

export function simulateMuster(raw: MusterParams = {}): MusterSim {
  const p = MusterParams.parse(raw)
  const rng = makeRng(p.seed >>> 0)
  const people: MusterPerson[] = []
  const add = (group: 'passengers' | 'crew', n: number, planted: number): void => {
    for (let i = 0; i < n; i++) {
      const isPlanted = i < planted
      const countedMin = isPlanted
        ? Math.round(rng.uniform(26, p.lastFoundMin))
        : Math.min(25, Math.max(2, Math.round(rng.lognormal(9, 0.4))))
      const deck = 2 + rng.int(11)
      people.push({
        code: `${group === 'passengers' ? 'P' : 'C'}-${String(i + 1).padStart(4, '0')}`,
        group,
        countedMin,
        planted: isPlanted,
        location: isPlanted ? `Deck ${deck}, cabin ${deck}${String(10 + rng.int(90))}` : '',
      })
    }
  }
  add('passengers', p.passengers, Math.min(p.unaccountedPassengers, p.passengers))
  add('crew', p.crew, Math.min(p.unaccountedCrew, p.crew))
  const completeMin = Math.max(...people.map((x) => x.countedMin))
  return { params: p, startMs: Date.parse(p.start), people, completeMin }
}

/** Persons not yet counted `min` minutes after the alarm, by group. */
export function unaccountedAt(sim: MusterSim, min: number): { passengers: number; crew: number } {
  const open = (g: 'passengers' | 'crew'): number =>
    sim.people.filter((x) => x.group === g && x.countedMin > min).length
  return { passengers: open('passengers'), crew: open('crew') }
}

// ---- hurricane ----------------------------------------------------------------------------

export const HurricaneParams = z.object({
  seed: z.number().int().default(1),
  /** The first advisory the plan reads, local time written as Z. */
  start: z.iso.datetime().default('2026-09-17T12:00:00Z'),
  guests: z.number().int().min(20).max(20_000).default(600),
  /** Hours after the start when the airport counter closes, the causeway closes and winds arrive. */
  airportClosesHour: z.number().min(2).max(48).default(10),
  causewayClosesHour: z.number().min(2).max(48).default(12),
  windsArriveHour: z.number().min(4).max(72).default(14),
  /** Hours the front office takes to start departures, which shifts the whole curve. */
  startLagHours: z.number().min(0).max(12).default(1),
  /** Fraction of guests who leave if departures run well. */
  departureShare: z.number().min(0.1).max(1).default(0.7),
})
export type HurricaneParams = z.input<typeof HurricaneParams>

export interface HurricaneSim {
  params: z.output<typeof HurricaneParams>
  startMs: number
  /** Cumulative guests departed at each hour from the start. */
  departed: { hour: number; guests: number }[]
  closures: { id: string; hour: number; label: string }[]
}

export function simulateHurricane(raw: HurricaneParams = {}): HurricaneSim {
  const p = HurricaneParams.parse(raw)
  const rng = makeRng(p.seed >>> 0)
  const total = Math.round(p.guests * p.departureShare)
  const lastHour = Math.min(p.airportClosesHour, p.causewayClosesHour)
  const window = Math.max(1, lastHour - p.startLagHours)
  const departed: HurricaneSim['departed'] = []
  let done = 0
  for (let h = 0; h <= p.windsArriveHour; h++) {
    const progress = Math.min(1, Math.max(0, (h - p.startLagHours) / window))
    const shaped = progress * progress * (3 - 2 * progress)
    const target = Math.round(total * shaped)
    done = Math.max(
      done,
      Math.min(total, target + (h > p.startLagHours && h < lastHour ? rng.int(3) : 0)),
    )
    departed.push({ hour: h, guests: done })
  }
  return {
    params: p,
    startMs: Date.parse(p.start),
    departed,
    closures: [
      { id: 'airport_closure', hour: p.airportClosesHour, label: 'Airport counter closes' },
      { id: 'causeway_closure', hour: p.causewayClosesHour, label: 'Causeway closes' },
      { id: 'winds_arrive', hour: p.windsArriveHour, label: 'Tropical-storm-force winds arrive' },
    ],
  }
}

// ---- tower fire ---------------------------------------------------------------------------

export const TowerFireParams = z.object({
  seed: z.number().int().default(1),
  start: z.iso.datetime().default('2026-11-03T19:45:00Z'),
  topFloor: z.number().int().min(6).max(60).default(16),
  firstFloor: z.number().int().min(2).max(20).default(10),
  fireFloor: z.number().int().min(3).max(60).default(14),
  /** Registered guests on a typical floor (the list may be out of date by `lateCheckIns`). */
  guestsPerFloor: z.number().int().min(10).max(200).default(60),
  lateCheckIns: z.number().int().min(0).max(100).default(4),
})
export type TowerFireParams = z.input<typeof TowerFireParams>

export interface FloorSim {
  floor: number
  registered: number
  assistance: number
  /** Minutes after the alarm when everyone found is out and counted. */
  clearMin: number
  /** Guests who are found only late (not answering the door, in the pool, and so on). */
  lateFound: number
}

export interface TowerFireSim {
  params: z.output<typeof TowerFireParams>
  startMs: number
  floors: FloorSim[]
}

export function simulateTowerFire(raw: TowerFireParams = {}): TowerFireSim {
  const p = TowerFireParams.parse(raw)
  const rng = makeRng(p.seed >>> 0)
  const floors: FloorSim[] = []
  for (let f = p.firstFloor; f <= p.topFloor; f++) {
    const registered = Math.max(5, p.guestsPerFloor + rng.int(7) - 3)
    const near = Math.abs(f - p.fireFloor)
    floors.push({
      floor: f,
      registered,
      assistance: rng.int(4),
      clearMin: Math.round(8 + near * 1.5 + rng.uniform(0, 6)),
      lateFound: f === p.fireFloor ? Math.round(registered * 0.2) : rng.int(4),
    })
  }
  return { params: p, startMs: Date.parse(p.start), floors }
}

/** Guests accounted for on a floor `min` minutes after the alarm: most by the clear time, the rest later. */
export function accountedAt(f: FloorSim, min: number): number {
  const body = f.registered - f.lateFound
  const ramp = Math.min(1, Math.max(0, min / f.clearMin))
  const late = min > f.clearMin ? Math.min(f.lateFound, Math.floor((min - f.clearMin) / 3)) : 0
  return Math.round(body * ramp) + late
}

/** The floors as the floor status figure takes them at `min` minutes. */
export function floorStatusAt(sim: TowerFireSim, min: number) {
  return sim.floors
    .map((f) => {
      const accounted = accountedAt(f, min)
      return {
        floor: String(f.floor),
        registered: f.registered,
        accounted,
        assistance: f.assistance,
        state: (min <= 0 ? 'not_started' : accounted >= f.registered ? 'clear' : 'clearing') as
          'not_started' | 'clear' | 'clearing',
      }
    })
    .reverse()
}

// ---- cyber outage -------------------------------------------------------------------------

export const CyberOutageParams = z.object({
  seed: z.number().int().default(1),
  start: z.iso.datetime().default('2026-11-07T14:10:00Z'),
  /** Guests expected to arrive during the outage window. */
  arrivalsPerHour: z.number().min(5).max(500).default(45),
  keycardsRestoredHour: z.number().min(1).max(72).default(9),
  reservationsRestoredHour: z.number().min(1).max(120).default(30),
})
export type CyberOutageParams = z.input<typeof CyberOutageParams>

export interface CyberSim {
  params: z.output<typeof CyberOutageParams>
  startMs: number
  /** Timeline events in minutes after the first symptom. */
  events: { id: string; kind: string; minute: number; note: string }[]
  /** Guests waiting at the desk each hour. */
  queue: { hour: number; waiting: number }[]
}

export function simulateCyberOutage(raw: CyberOutageParams = {}): CyberSim {
  const p = CyberOutageParams.parse(raw)
  const rng = makeRng(p.seed >>> 0)
  const events = [
    { id: 'pms_down', kind: 'pms_down', minute: 0, note: 'Check-in screens stop responding' },
    { id: 'keycards_down', kind: 'keycards_down', minute: 20, note: 'Encoders refuse new keys' },
    {
      id: 'ransom_note',
      kind: 'ransom_note',
      minute: 45,
      note: 'A note appears on a back-office server',
    },
    {
      id: 'paper_checkin',
      kind: 'degraded_mode_started',
      minute: 60,
      note: 'Paper registration and mechanical keys',
    },
    {
      id: 'containment',
      kind: 'containment_started',
      minute: 180,
      note: 'Technical team isolates the network',
    },
    {
      id: 'keycards_restored',
      kind: 'keycards_restored',
      minute: Math.round(p.keycardsRestoredHour * 60),
      note: 'Encoders working again',
    },
    {
      id: 'reservations_restored',
      kind: 'reservations_restored',
      minute: Math.round(p.reservationsRestoredHour * 60),
      note: 'Reservations back; reconciliation begins',
    },
  ].sort((a, b) => a.minute - b.minute)
  const queue: CyberSim['queue'] = []
  let waiting = 0
  for (let h = 0; h <= Math.min(p.reservationsRestoredHour, 48); h++) {
    const served =
      h * 60 < 60
        ? p.arrivalsPerHour
        : h < p.keycardsRestoredHour
          ? p.arrivalsPerHour * 0.6
          : p.arrivalsPerHour * 1.4
    waiting = Math.max(0, Math.round(waiting + p.arrivalsPerHour - served + rng.int(5) - 2))
    queue.push({ hour: h, waiting })
  }
  return { params: p, startMs: Date.parse(p.start), events, queue }
}
