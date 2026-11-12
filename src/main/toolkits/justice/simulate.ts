// Simulated justice events (spec 0465 FR-10, ADR-0131): a call surge, an incident timeline, a jail
// count, a court outage and an evidence audit. Each is a pure function of its parameters that
// writes ground-truth events a metric can score decisions against. The framework labels the
// output simulated. All names are fictional and nothing here describes tactics: units arrive,
// command is named, a count differs, a system is down. Times are minutes from a start time.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { makeRng } from '../epidemiology/simulate/rng'

const MIN_MS = 60_000
const START = z.object({ startTime: z.iso.datetime().default('2026-10-28T14:00:00Z') })
const iso = (startMs: number, minutes: number): string =>
  new Date(startMs + Math.round(minutes * MIN_MS)).toISOString()

type EventEntry = { t: string; title: string; text: string }
const entry = (
  t: string,
  id: string,
  kind: string,
  attrs: Record<string, unknown> = {},
): EventEntry => ({ t, title: id, text: JSON.stringify({ id, kind, attrs }) })

const eventsDataset = (id: string, label: string, events: EventEntry[]): GeneratedDataset => ({
  id,
  label: `${label} (simulated, for scoring)`,
  kind: 'reports',
  range: { start: events[0]!.t, end: events[events.length - 1]!.t },
  data: events,
})

const sortByTime = (events: EventEntry[]): EventEntry[] =>
  [...events].sort((a, b) => Date.parse(a.t) - Date.parse(b.t))

// ---- call surge --------------------------------------------------------------------------------

const surgeParams = START.extend({
  seed: z.number().int().default(7),
  calls: z.number().int().min(1).max(500).default(40),
  units: z.number().int().min(1).max(60).default(8),
  /** Median response time in minutes (call received to first unit arriving). */
  medianResponseMin: z.number().min(1).max(60).default(6),
  /** Minutes over which the calls arrive. */
  windowMin: z.number().min(1).max(240).default(20),
})

export const justiceCallSurgeGenerator: SimulatedGenerator<z.output<typeof surgeParams>> = {
  id: 'justice-call-surge',
  label: 'Simulated call surge with dispatched units and arrival times',
  params: surgeParams,
  description:
    'Simulates a burst of calls handled by a fixed number of units: the unit that frees up first takes the next call, so response time grows when every unit is busy. Writes each call received and each unit arrival with its response time.',
  toolkits: ['justice', 'dispatch'],
  example: {
    startTime: '2026-10-28T14:00:00Z',
    seed: 7,
    calls: 40,
    units: 8,
    medianResponseMin: 6,
    windowMin: 20,
  } satisfies z.input<typeof surgeParams>,
  fields: {
    startTime: { label: 'Start (UTC)' },
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    calls: { label: 'Calls', help: 'Calls in the surge, 1 to 500.' },
    units: { label: 'Units', help: 'Units available to respond, 1 to 60.' },
    medianResponseMin: {
      label: 'Median response (minutes)',
      help: 'Median minutes from call received to first unit arriving when a unit is free, 1 to 60.',
    },
    windowMin: {
      label: 'Arrival window (minutes)',
      help: 'Minutes over which the calls arrive, 1 to 240.',
    },
  },
  generate(p) {
    const rng = makeRng(p.seed)
    const t0 = Date.parse(p.startTime)
    const freeAt = Array.from({ length: p.units }, () => 0)
    const events: EventEntry[] = []
    for (let i = 0; i < p.calls; i++) {
      const received = (i / p.calls) * p.windowMin
      const id = `call-${i + 1}`
      events.push(entry(iso(t0, received), id, 'call_received', { call: id }))
      // The unit that frees up first takes the call; response grows when every unit is busy.
      let u = 0
      for (let k = 1; k < freeAt.length; k++) if (freeAt[k]! < freeAt[u]!) u = k
      const dispatched = Math.max(received, freeAt[u]!)
      const travel = rng.lognormal(p.medianResponseMin, 0.35)
      const arrived = dispatched + travel
      freeAt[u] = arrived + rng.uniform(8, 25)
      events.push(
        entry(iso(t0, arrived), `arrival-${i + 1}`, 'unit_arrival', {
          call: id,
          unit: `Unit ${u + 1}`,
          responseMin: Math.round((arrived - received) * 10) / 10,
        }),
      )
    }
    return [
      eventsDataset('justice-call-events', 'Call and unit arrival events', sortByTime(events)),
    ]
  },
}

// ---- incident timeline -----------------------------------------------------------------------------

const agencyParam = z.object({
  agency: z.string().min(1).max(80),
  arrivalMin: z.number().min(0).max(600),
  /** Minutes at which the agency is at the command post and part of unified command. */
  joinMin: z.number().min(0).max(600),
})

const timelineParams = START.extend({
  firstArrivalMin: z.number().min(0).max(120).default(4),
  commandNamedMin: z.number().min(0).max(240).default(11),
  commandPostStaffedMin: z.number().min(0).max(240).default(16),
  mutualAidRequestedMin: z.number().min(0).max(600).default(24),
  firstStatementMin: z.number().min(0).max(600).default(33),
  familyCenterOpenMin: z.number().min(0).max(600).default(50),
  agencies: z
    .array(agencyParam)
    .min(1)
    .max(8)
    .default([
      { agency: 'Marston Police Department', arrivalMin: 4, joinMin: 11 },
      { agency: 'Marston County Sheriff’s Office', arrivalMin: 6, joinMin: 16 },
      { agency: 'Marston County Fire and EMS', arrivalMin: 8, joinMin: 19 },
      { agency: 'State Patrol', arrivalMin: 21, joinMin: 35 },
    ]),
})

export const justiceIncidentTimelineGenerator: SimulatedGenerator<z.output<typeof timelineParams>> =
  {
    id: 'justice-incident-timeline',
    label: 'Simulated multi-agency incident: arrivals, command and public information',
    params: timelineParams.refine((p) => p.agencies.every((a) => a.joinMin >= a.arrivalMin), {
      message: 'an agency cannot join unified command before it arrives',
    }),
    description:
      'Simulates the milestones of a multi-agency incident: first arrival, command named, command post staffed, mutual aid, the first public statement, the family center opening, and each agency arriving and joining unified command. Writes the milestone events, timed in minutes from the first report.',
    toolkits: ['justice'],
    example: {
      startTime: '2026-10-28T14:00:00Z',
      firstArrivalMin: 4,
      commandNamedMin: 11,
      commandPostStaffedMin: 16,
      mutualAidRequestedMin: 24,
      firstStatementMin: 33,
      familyCenterOpenMin: 50,
      agencies: [
        { agency: 'Marston Police Department', arrivalMin: 4, joinMin: 11 },
        { agency: 'Marston County Sheriff’s Office', arrivalMin: 6, joinMin: 16 },
        { agency: 'Marston County Fire and EMS', arrivalMin: 8, joinMin: 19 },
        { agency: 'State Patrol', arrivalMin: 21, joinMin: 35 },
      ],
    } satisfies z.input<typeof timelineParams>,
    fields: {
      startTime: { label: 'First report (UTC)' },
      firstArrivalMin: {
        label: 'First arrival (minutes)',
        help: 'Minutes after the first report.',
      },
      commandNamedMin: {
        label: 'Command named (minutes)',
        help: 'Minutes after the first report.',
      },
      commandPostStaffedMin: {
        label: 'Command post staffed (minutes)',
        help: 'Minutes after the first report.',
      },
      mutualAidRequestedMin: {
        label: 'Mutual aid requested (minutes)',
        help: 'Minutes after the first report.',
      },
      firstStatementMin: {
        label: 'First public statement (minutes)',
        help: 'Minutes after the first report.',
      },
      familyCenterOpenMin: {
        label: 'Family center open (minutes)',
        help: 'Minutes after the first report.',
      },
      agencies: {
        label: 'Agencies',
        help: 'Each item: agency (name), arrivalMin and joinMin (minutes after the first report when it arrives and joins unified command; joining cannot come before arriving).',
      },
    },
    generate(p) {
      const t0 = Date.parse(p.startTime)
      const at = (m: number): string => iso(t0, m)
      const events: EventEntry[] = [
        entry(at(0), 'first-report', 'first_report'),
        entry(at(p.firstArrivalMin), 'first-arrival', 'first_arrival'),
        entry(at(p.commandNamedMin), 'command-named', 'command_named'),
        entry(at(p.commandPostStaffedMin), 'command-post-staffed', 'command_post_staffed'),
        entry(at(p.mutualAidRequestedMin), 'mutual-aid-requested', 'mutual_aid_requested'),
        entry(at(p.firstStatementMin), 'first-public-statement', 'first_public_statement'),
        entry(at(p.familyCenterOpenMin), 'family-center-open', 'family_center_open'),
        ...p.agencies.flatMap((a, i) => [
          entry(at(a.arrivalMin), `agency-arrival-${i + 1}`, 'agency_arrival', {
            agency: a.agency,
          }),
          entry(at(a.joinMin), `agency-joined-${i + 1}`, 'agency_joined_unified_command', {
            agency: a.agency,
          }),
        ]),
      ]
      return [
        eventsDataset('justice-incident-events', 'Incident milestone events', sortByTime(events)),
      ]
    },
  }

// ---- jail count -------------------------------------------------------------------------------------

const areaParam = z.object({
  area: z.string().min(1).max(60),
  population: z.number().int().min(0).max(400),
})
const moveParam = z.object({
  from: z.string().max(60),
  to: z.string().max(60),
  people: z.number().int().min(1).max(50),
  atMin: z.number().min(0).max(240),
  logged: z.boolean().default(true),
})

const jailParams = START.extend({
  areas: z
    .array(areaParam)
    .min(1)
    .max(12)
    .default([
      { area: 'Housing Unit 1', population: 58 },
      { area: 'Housing Unit 2', population: 60 },
      { area: 'Housing Unit 3', population: 34 },
      { area: 'Housing Unit 4', population: 64 },
      { area: 'Medical', population: 0 },
    ]),
  moves: z
    .array(moveParam)
    .max(20)
    .default([{ from: 'Housing Unit 4', to: 'Medical', people: 2, atMin: 8, logged: true }]),
  countAtMin: z.number().min(0).max(240).default(20),
})

/** A ground-truth count and movement event, as the generator writes it. */
export interface JailEvent {
  kind: 'count_taken' | 'movement'
  attrs: Record<string, unknown>
}

/**
 * The difference between the count and the expected population, by area, after applying every
 * movement in the log. Zero everywhere means the count is explained; an unlogged move leaves a
 * difference the log cannot explain.
 */
export function unexplainedDifferences(events: JailEvent[]): Record<string, number> {
  const logged: Record<string, number> = {}
  for (const e of events)
    if (e.kind === 'movement' && e.attrs.logged === true) {
      const n = Number(e.attrs.people)
      logged[String(e.attrs.from)] = (logged[String(e.attrs.from)] ?? 0) - n
      logged[String(e.attrs.to)] = (logged[String(e.attrs.to)] ?? 0) + n
    }
  const out: Record<string, number> = {}
  for (const e of events)
    if (e.kind === 'count_taken') {
      const area = String(e.attrs.area)
      out[area] = Number(e.attrs.counted) - (Number(e.attrs.expected) + (logged[area] ?? 0))
    }
  return out
}

export const justiceJailCountGenerator: SimulatedGenerator<z.output<typeof jailParams>> = {
  id: 'justice-jail-count',
  label: 'Simulated jail count with housing movement and a discrepancy',
  params: jailParams,
  description:
    'Simulates a jail count taken after people move between housing areas, where a move left out of the log leaves a difference the count cannot explain. Writes the movement events and the expected and counted population of each area.',
  toolkits: ['justice'],
  example: {
    startTime: '2026-10-28T14:00:00Z',
    areas: [
      { area: 'Housing Unit 1', population: 58 },
      { area: 'Housing Unit 2', population: 60 },
      { area: 'Housing Unit 4', population: 64 },
      { area: 'Medical', population: 0 },
    ],
    moves: [
      { from: 'Housing Unit 4', to: 'Medical', people: 2, atMin: 8, logged: true },
      { from: 'Housing Unit 1', to: 'Housing Unit 2', people: 1, atMin: 12, logged: false },
    ],
    countAtMin: 20,
  } satisfies z.input<typeof jailParams>,
  fields: {
    startTime: { label: 'Start (UTC)' },
    areas: {
      label: 'Housing areas',
      help: 'Each item: area (name) and population (people expected there at the start).',
    },
    moves: {
      label: 'Moves',
      help: 'Each item: from and to (area names), people, atMin (minutes after the start) and logged (false for a move missing from the log).',
    },
    countAtMin: {
      label: 'Count taken (minutes)',
      help: 'Minutes after the start when the count is taken, 0 to 240.',
    },
  },
  generate(p) {
    const t0 = Date.parse(p.startTime)
    const actual: Record<string, number> = Object.fromEntries(
      p.areas.map((a) => [a.area, a.population]),
    )
    for (const m of p.moves) {
      actual[m.from] = (actual[m.from] ?? 0) - m.people
      actual[m.to] = (actual[m.to] ?? 0) + m.people
    }
    const events: EventEntry[] = [
      ...p.moves.map((m, i) =>
        entry(iso(t0, m.atMin), `movement-${i + 1}`, 'movement', {
          from: m.from,
          to: m.to,
          people: m.people,
          logged: m.logged,
        }),
      ),
      ...p.areas.map((a) =>
        entry(
          iso(t0, p.countAtMin),
          `count-${a.area.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          'count_taken',
          {
            area: a.area,
            expected: a.population,
            counted: actual[a.area] ?? 0,
          },
        ),
      ),
    ]
    return [
      eventsDataset('justice-count-events', 'Jail count and movement events', sortByTime(events)),
    ]
  },
}

// ---- court outage -----------------------------------------------------------------------------------

/** Systems a court depends on, and what each needs running first. */
export const COURT_SYSTEMS = {
  telephones: { label: 'Telephones', needs: [] as string[], rtoHours: 8 },
  public_website: { label: 'Public website', needs: [] as string[], rtoHours: 12 },
  case_management: { label: 'Case management system', needs: ['telephones'], rtoHours: 48 },
  e_filing: { label: 'E-filing', needs: ['case_management', 'public_website'], rtoHours: 72 },
} as const
export type CourtSystemId = keyof typeof COURT_SYSTEMS
const SYSTEM_IDS = Object.keys(COURT_SYSTEMS) as CourtSystemId[]

/** The systems in an order that violates a dependency (a system restored before one it needs). */
export function dependencyViolations(order: readonly CourtSystemId[]): string[] {
  const out: string[] = []
  order.forEach((id, i) => {
    for (const need of COURT_SYSTEMS[id].needs)
      if (order.indexOf(need as CourtSystemId) > i)
        out.push(
          `${COURT_SYSTEMS[id].label} cannot return before ${COURT_SYSTEMS[need as CourtSystemId].label}`,
        )
  })
  return out
}

const outageParams = START.extend({
  restorationOrder: z
    .array(z.enum(['telephones', 'public_website', 'case_management', 'e_filing']))
    .default(['telephones', 'public_website', 'case_management', 'e_filing']),
  /** Hours after the outage began at which each system is restored, in the order above. */
  restoredAtHours: z.array(z.number().min(0).max(2000)).default([3, 16, 52, 60]),
})

export const justiceCourtOutageGenerator: SimulatedGenerator<z.output<typeof outageParams>> = {
  id: 'justice-court-outage',
  label: 'Simulated court outage with systems, dependencies and restoration order',
  description:
    'Simulates an outage of court systems (telephones, public website, case management and e-filing) and their return in the order you set, which must respect what each system needs first. Writes the system down and restored events with each recovery time objective.',
  toolkits: ['justice'],
  example: {
    startTime: '2026-10-28T14:00:00Z',
    restorationOrder: ['telephones', 'public_website', 'case_management', 'e_filing'],
    restoredAtHours: [3, 16, 52, 60],
  } satisfies z.input<typeof outageParams>,
  fields: {
    startTime: { label: 'Outage start (UTC)' },
    restorationOrder: {
      label: 'Restoration order',
      help: 'Each system once, in the order restored; case management needs telephones, and e-filing needs case management and the public website.',
    },
    restoredAtHours: {
      label: 'Restored at (hours)',
      help: 'Hours after the outage began when each system returns, one per system in the order above, never decreasing.',
    },
  },
  params: outageParams
    .refine((p) => new Set(p.restorationOrder).size === p.restorationOrder.length, {
      message: 'a system appears once in the restoration order',
    })
    .refine((p) => p.restoredAtHours.length === p.restorationOrder.length, {
      message: 'one restoration time per system in the order',
    })
    .refine((p) => p.restoredAtHours.every((h, i, a) => i === 0 || h >= a[i - 1]!), {
      message: 'restoration times must not decrease',
    })
    .refine((p) => dependencyViolations(p.restorationOrder).length === 0, {
      message: 'the restoration order must respect dependencies',
    }),
  generate(p) {
    const t0 = Date.parse(p.startTime)
    const hourIso = (h: number): string => new Date(t0 + h * 3_600_000).toISOString()
    const events: EventEntry[] = [
      ...SYSTEM_IDS.map((id) =>
        entry(hourIso(0), `down-${id}`, 'system_down', {
          system: id,
          label: COURT_SYSTEMS[id].label,
          rtoHours: COURT_SYSTEMS[id].rtoHours,
        }),
      ),
      ...p.restorationOrder.map((id, i) =>
        entry(hourIso(p.restoredAtHours[i]!), `restored-${id}`, 'system_restored', {
          system: id,
          label: COURT_SYSTEMS[id].label,
          rtoHours: COURT_SYSTEMS[id].rtoHours,
          dependsOn: COURT_SYSTEMS[id].needs.join(', '),
        }),
      ),
    ]
    return [
      eventsDataset(
        'justice-court-events',
        'Court outage and restoration events',
        sortByTime(events),
      ),
    ]
  },
}

// ---- evidence audit ---------------------------------------------------------------------------------

const auditParams = START.extend({
  seed: z.number().int().default(11),
  items: z.number().int().min(1).max(2000).default(412),
  missing: z.number().int().min(0).max(200).default(3),
  notLogged: z.number().int().min(0).max(200).default(2),
})

export const justiceEvidenceAuditGenerator: SimulatedGenerator<z.output<typeof auditParams>> = {
  id: 'justice-evidence-audit',
  label: 'Simulated evidence audit with a configurable discrepancy',
  description:
    'Simulates a property and evidence room audit that finds some items missing and some present but not logged. Writes the audit start, each discrepancy and the audit result.',
  toolkits: ['justice'],
  example: {
    startTime: '2026-10-28T14:00:00Z',
    seed: 11,
    items: 412,
    missing: 3,
    notLogged: 2,
  } satisfies z.input<typeof auditParams>,
  fields: {
    startTime: { label: 'Audit start (UTC)' },
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    items: { label: 'Items audited', help: 'Items the log says are in the room, 1 to 2,000.' },
    missing: { label: 'Items missing', help: 'Items in the log but not found, 0 to 200.' },
    notLogged: {
      label: 'Items not logged',
      help: 'Items found but missing from the log, 0 to 200.',
    },
  },
  params: auditParams.refine((p) => p.missing + p.notLogged <= p.items, {
    message: 'discrepancies cannot exceed the items audited',
  }),
  generate(p) {
    const rng = makeRng(p.seed)
    const t0 = Date.parse(p.startTime)
    const pick = (n: number, taken: Set<number>): number[] => {
      const out: number[] = []
      while (out.length < n) {
        const i = rng.int(p.items)
        if (!taken.has(i)) {
          taken.add(i)
          out.push(i)
        }
      }
      return out
    }
    const taken = new Set<number>()
    const missing = pick(p.missing, taken)
    const notLogged = pick(p.notLogged, taken)
    const item = (i: number): string => `PR-26-${String(i + 1).padStart(4, '0')}`
    const events: EventEntry[] = [
      entry(iso(t0, 0), 'audit-started', 'audit_started', { expected: p.items }),
      ...missing.map((i, k) =>
        entry(iso(t0, 30 + k * 4), `discrepancy-missing-${k + 1}`, 'audit_discrepancy', {
          item: item(i),
          type: 'missing',
        }),
      ),
      ...notLogged.map((i, k) =>
        entry(iso(t0, 45 + k * 4), `discrepancy-not-logged-${k + 1}`, 'audit_discrepancy', {
          item: item(i),
          type: 'not_logged',
        }),
      ),
      entry(iso(t0, 90), 'audit-complete', 'audit_complete', {
        expected: p.items,
        counted: p.items - p.missing,
        discrepancies: p.missing + p.notLogged,
      }),
    ]
    return [eventsDataset('justice-audit-events', 'Evidence audit events', sortByTime(events))]
  },
}

export const JUSTICE_GENERATORS: readonly SimulatedGenerator[] = [
  justiceCallSurgeGenerator,
  justiceIncidentTimelineGenerator,
  justiceJailCountGenerator,
  justiceCourtOutageGenerator,
  justiceEvidenceAuditGenerator,
] as unknown as readonly SimulatedGenerator[]
