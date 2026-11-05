// The post-disaster inspection program as exercise data (spec 0471 FR-9): the record a team
// reads for each building (the observed conditions a rapid evaluation form lists, drawn to fit the
// simulated damage state), a limited roster of evaluators with qualifications, the owner and
// public requests that arrive during the shift, and the traps a facilitator can switch on (the
// same condition placarded two ways, an unsafe adjacent building, an owner who refuses to
// leave). The structure follows the public guidance for post-disaster building safety
// evaluation; it is an exercise, not a copy of any program's forms. Seeded, so it repeats.
import { z } from 'zod'
import { DamageParams, simulateBuildings, type SimBuilding, TYPE_LABEL } from './damage-sim'
import { createStructuresRng } from './rng'

export const CONDITIONS = [
  'Collapse or partial collapse',
  'Building or story leaning',
  'Racking or damage to walls and columns',
  'Chimney, parapet or other falling hazard',
  'Ground slope movement or cracking',
  'Adjacent building hazard',
] as const
type Severity = 'None' | 'Minor' | 'Moderate' | 'Severe'

export const ProgramParams = DamageParams.extend({
  evaluatorCount: z.number().int().min(2).max(40).default(12),
  /** Traps the facilitator introduces; all are off by default. */
  traps: z
    .object({
      conflictingPlacards: z.boolean().default(false),
      unsafeAdjacent: z.boolean().default(false),
      ownerRefuses: z.boolean().default(false),
    })
    .default({ conflictingPlacards: false, unsafeAdjacent: false, ownerRefuses: false }),
})
export type ProgramParams = z.infer<typeof ProgramParams>

export interface BuildingRecord {
  id: string
  name: string
  constructionType: string
  priority: SimBuilding['priority']
  conditions: { condition: string; severity: Severity; note: string }[]
}

/** Observed conditions that fit the true placard: green is light, yellow has a moderate finding, red a severe one. */
export function recordFor(b: SimBuilding, roll: number): BuildingRecord {
  const sev: Severity[] = CONDITIONS.map(() => 'None')
  const pick = (list: readonly number[]): number =>
    list[Math.floor(roll * list.length) % list.length]!
  if (b.truth === 'UNSAFE') {
    sev[pick([0, 1, 2])] = 'Severe'
    sev[3] = 'Moderate'
  } else if (b.truth === 'RESTRICTED USE') {
    sev[pick([2, 3, 4])] = 'Moderate'
  } else if (roll > 0.5) {
    sev[3] = 'Minor'
  }
  return {
    id: b.id,
    name: b.name,
    constructionType: TYPE_LABEL[b.type],
    priority: b.priority,
    conditions: CONDITIONS.map((c, i) => ({
      condition: c,
      severity: sev[i]!,
      note:
        sev[i] === 'None'
          ? ''
          : `${sev[i]!} finding recorded by the first walk-around at ${b.name}.`,
    })),
  }
}

const GIVEN = ['K.', 'R.', 'S.', 'L.', 'M.', 'D.', 'A.', 'P.', 'T.', 'J.']
const FAMILY = [
  'Osei',
  'Alvarez',
  'Kapoor',
  'Brandt',
  'Nguyen',
  'Okafor',
  'Moretti',
  'Haas',
  'Tran',
  'Reyes',
]
const QUALS = [
  'licensed structural engineer',
  'licensed civil engineer',
  'registered architect',
  'certified building inspector',
  'building inspector in training (works with a partner)',
]

export interface Evaluator {
  id: string
  name: string
  qualification: string
  availableFromMinute: number
}

export function rosterFor(count: number, seed: number): Evaluator[] {
  const rng = createStructuresRng(seed + 101)
  return Array.from({ length: count }, (_, i) => ({
    id: `E-${String(i + 1).padStart(2, '0')}`,
    name: `${GIVEN[i % GIVEN.length]} ${FAMILY[(i * 3 + 1) % FAMILY.length]}`,
    qualification: QUALS[i < Math.ceil(count / 4) ? 0 : rng.pick([1, 2, 3, 3, 4])]!,
    availableFromMinute: i < count / 2 ? 0 : 60 * (1 + (i % 3)),
  }))
}

export interface ProgramRequest {
  atMinute: number
  from: string
  text: string
  buildingId?: string
  trap?: 'conflicting_placards' | 'unsafe_adjacent' | 'owner_refuses'
}

export interface Program {
  buildings: SimBuilding[]
  records: BuildingRecord[]
  evaluators: Evaluator[]
  requests: ProgramRequest[]
}

export function buildProgram(raw: z.input<typeof ProgramParams>): Program {
  const p = ProgramParams.parse(raw)
  const buildings = simulateBuildings(p)
  const rng = createStructuresRng(p.seed + 7)
  const records = buildings.map((b) => recordFor(b, rng.next()))
  const requests: ProgramRequest[] = []
  const priority = buildings.filter((b) => b.priority !== 'other')
  const others = buildings.filter((b) => b.priority === 'other')
  // Ordinary requests: an owner or a neighbor asks about one building.
  for (let i = 0; i < Math.min(6, others.length); i++) {
    const b = others[Math.floor(rng.next() * others.length)]!
    requests.push({
      atMinute: 30 + i * 45,
      from: i % 2 ? 'a neighbor' : 'the owner',
      buildingId: b.id,
      text:
        i % 2
          ? `A neighbor reports a crack in the wall of ${b.name} and asks if it is safe to walk past.`
          : `The owner of ${b.name} asks when a team will come and whether tenants can stay tonight.`,
    })
  }
  if (priority[0])
    requests.push({
      atMinute: 20,
      from: 'the emergency operations center',
      buildingId: priority[0].id,
      text: `The EOC asks for an evaluation of ${priority[0].name} first: it is a ${priority[0].priority === 'hospital' ? 'hospital or critical facility' : priority[0].priority}.`,
    })
  if (p.traps.conflictingPlacards && others.length > 1) {
    const [a, b] = [others[0]!, others[1]!]
    requests.push({
      atMinute: 150,
      from: 'a team leader',
      buildingId: a.id,
      trap: 'conflicting_placards',
      text: `Team 1 posted a placard on ${a.name} and Team 2 posted a different one on ${b.name}; the two buildings have the same observed condition. Which stands?`,
    })
  }
  if (p.traps.unsafeAdjacent) {
    const unsafe = buildings.find((b) => b.truth === 'UNSAFE')
    if (unsafe)
      requests.push({
        atMinute: 120,
        from: 'an evaluator',
        buildingId: unsafe.id,
        trap: 'unsafe_adjacent',
        text: `An evaluator reports that the building next to ${unsafe.name} has a leaning wall that could fall on the street where teams are working.`,
      })
  }
  if (p.traps.ownerRefuses) {
    const unsafe = [...buildings].reverse().find((b) => b.truth === 'UNSAFE')
    if (unsafe)
      requests.push({
        atMinute: 200,
        from: 'a team',
        buildingId: unsafe.id,
        trap: 'owner_refuses',
        text: `The owner of ${unsafe.name} will not leave the building after it was placarded UNSAFE and says only the building official can make that decision.`,
      })
  }
  requests.sort((a, b) => a.atMinute - b.atMinute)
  return { buildings, records, evaluators: rosterFor(p.evaluatorCount, p.seed), requests }
}
