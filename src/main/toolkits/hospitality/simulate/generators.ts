// The hospitality simulations as case-data generators (spec 0448 FR-10, spec 0470 FR-7, FR-8).
// Each is a pure function of its parameters; the framework labels the output simulated. Every
// label here says "simulated" too, and every person is a code. Event datasets are text entries
// whose JSON is a ground-truth event, so every reader of case data still reads them and the
// metrics read them as events (see readGroundTruth).
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import type { ModeledSeries } from '@shared/schemas/metrics'
import {
  CyberOutageParams,
  HurricaneParams,
  MusterParams,
  TowerFireParams,
  floorStatusAt,
  simulateCyberOutage,
  simulateHurricane,
  simulateMuster,
  simulateTowerFire,
  unaccountedAt,
} from './emergencies'
import { OutbreakAtSeaParams, casesBy, dailyRows, simulateOutbreak } from './outbreak'

const MARKING = 'EXERCISE ONLY. Fictional person.'
const MIN = 60_000
const HOUR = 60 * MIN
const iso = (ms: number): string => new Date(ms).toISOString()

const eventEntry = (
  ms: number,
  id: string,
  kind: string,
  attrs: Record<string, unknown> = {},
): { t: string; title: string; text: string } => ({
  t: iso(ms),
  title: id,
  text: JSON.stringify({ id, kind, attrs }),
})

const range = (a: number, b: number) => ({ start: iso(a), end: iso(Math.max(a, b)) })

// ---- outbreak at sea ----------------------------------------------------------------------

export const outbreakGenerator: SimulatedGenerator<ReturnType<typeof OutbreakAtSeaParams.parse>> = {
  id: 'hosp-outbreak-at-sea',
  label: 'Simulated gastroenteritis outbreak on a voyage (cases, thresholds, reports)',
  params: OutbreakAtSeaParams,
  description:
    'Simulates a gastroenteritis outbreak among passengers and crew over a voyage, with isolation and cleaning that prevent a share of later cases. Writes daily cases, a medical log with role codes, the 2 and 3 percent crossings, the reports the ship would send and the report points before arrival.',
  toolkits: ['outbreak_at_sea', 'guest_emergency', 'epidemiology'],
  example: {
    seed: 1,
    startDate: '2026-11-01T17:00:00Z',
    voyageDays: 7,
    passengers: 2410,
    crew: 980,
    passengerAttackRate: 0.04,
    crewAttackRate: 0.022,
    peakDay: 4,
    spreadDays: 1.3,
    isolationStartDay: 4.5,
    isolationEffect: 0.4,
  } satisfies OutbreakAtSeaParams,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    startDate: { label: 'Embarkation (UTC)' },
    voyageDays: { label: 'Voyage days', help: 'Length of the voyage, 3 to 14 days.' },
    passengers: { label: 'Passengers', help: 'Passengers on board, 100 to 10,000.' },
    crew: { label: 'Crew', help: 'Crew on board, 20 to 4,000.' },
    passengerAttackRate: {
      label: 'Passenger attack rate',
      help: 'Share of passengers ill by the end of the voyage before isolation, 0 to 0.3.',
    },
    crewAttackRate: {
      label: 'Crew attack rate',
      help: 'Share of crew ill by the end of the voyage before isolation, 0 to 0.3.',
    },
    peakDay: {
      label: 'Peak day',
      help: 'Voyage day (from 0) of peak onset for passengers; crew peak half a day later.',
    },
    spreadDays: {
      label: 'Spread (days)',
      help: 'How widely onsets spread around the peak, 0.3 to 4 days.',
    },
    isolationStartDay: {
      label: 'Isolation starts (voyage day)',
      help: 'Day isolation and cleaning take effect; must be before the voyage ends.',
    },
    isolationEffect: {
      label: 'Isolation effect',
      help: 'Share of later cases isolation and cleaning prevent, 0 to 0.95.',
    },
  },
  generate(p) {
    const sim = simulateOutbreak(p)
    const span = range(sim.startMs, sim.arrivalMs)
    const events = [
      ...(sim.cases[0]
        ? [
            eventEntry(sim.cases[0].onsetMs, 'first-case', 'first_case', {
              group: sim.cases[0].group,
            }),
          ]
        : []),
      ...sim.crossings.map((c) =>
        eventEntry(c.timeMs, `threshold-${c.level}-${c.group}`, `threshold_${c.level}pct`, {
          group: c.group,
          cases: c.cases,
          percent: c.percent,
        }),
      ),
      eventEntry(sim.arrivalMs - 24 * HOUR, 'report-point-24h', 'report_point_24h', {
        opensAt: iso(sim.arrivalMs - 36 * HOUR),
      }),
      eventEntry(sim.arrivalMs - 4 * HOUR, 'report-point-4h', 'report_point_4h', {}),
      eventEntry(sim.arrivalMs, 'arrival', 'arrival', {}),
    ].sort((a, b) => a.t.localeCompare(b.t))
    const series: ModeledSeries[] = (['passengers', 'crew'] as const).map((g) => {
      const pop = g === 'passengers' ? sim.params.passengers : sim.params.crew
      const mine = sim.cases.filter((c) => c.group === g)
      return {
        zone: g === 'passengers' ? 'Passengers' : 'Crew',
        quantity: 'cumulative percent of persons on board',
        points: [
          { time: iso(sim.startMs), value: 0 },
          ...mine.map((c, i) => ({
            time: iso(c.onsetMs),
            value: Math.round(((i + 1) / pop) * 1000) / 10,
          })),
        ],
      }
    })
    return [
      {
        id: 'hosp-outbreak-events',
        label:
          'Simulated outbreak events: first case, 2 and 3 percent crossings, report points (for scoring)',
        kind: 'reports',
        range: span,
        data: events,
      },
      {
        id: 'hosp-threshold-series',
        label: 'Simulated cumulative percent ill by group (modeled series, simulated)',
        kind: 'series',
        shape: 'modeled-series',
        unit: 'percent',
        range: span,
        data: series,
      },
      {
        id: 'hosp-daily-cases',
        label: 'Simulated new cases per voyage day',
        kind: 'series',
        unit: 'cases per day',
        range: span,
        data: dailyRows(sim).map((r) => ({
          t: iso(sim.startMs + (r.day - 1) * 24 * HOUR),
          v: { passengers: r.passengers, crew: r.crew },
        })),
      },
      {
        id: 'hosp-medical-log',
        label: 'Simulated medical log (role codes, no names)',
        kind: 'reports',
        range: span,
        data: sim.cases.map((c) => ({
          t: iso(c.onsetMs),
          title: c.code,
          text: [
            MARKING,
            `group: ${c.group}`,
            `onset: ${iso(c.onsetMs)}`,
            `location: Deck ${c.deck}`,
          ].join('\n'),
        })),
      },
      {
        id: 'hosp-age-reports',
        label: 'Simulated reports the ship would send, with counts at each time',
        kind: 'reports',
        range: span,
        data: sim.reports.map((r) => ({
          t: iso(r.timeMs),
          title: r.type,
          text: [
            `${r.type}, ${r.hoursBeforeArrival} hours before arrival`,
            `passengers: ${r.passengerCases} of ${sim.params.passengers} (${r.passengerPercent}%)`,
            `crew: ${r.crewCases} of ${sim.params.crew} (${r.crewPercent}%)`,
          ].join('\n'),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

/** Total cases of a group at a time, for tests and examples. */
export const outbreakCasesAt = casesBy

// ---- muster -------------------------------------------------------------------------------

export const musterGenerator: SimulatedGenerator<ReturnType<typeof MusterParams.parse>> = {
  id: 'hosp-muster',
  label: 'Simulated muster with unaccounted persons (counts over time)',
  params: MusterParams,
  description:
    'Simulates a ship muster in which some passengers and crew do not reach a station on their own and are found later. Writes the muster events, the count of persons not yet accounted for every 5 minutes, and a roster of those persons by code.',
  toolkits: ['guest_emergency'],
  example: {
    seed: 1,
    start: '2026-11-03T20:30:00Z',
    passengers: 2410,
    crew: 980,
    unaccountedPassengers: 22,
    unaccountedCrew: 9,
    lastFoundMin: 75,
  } satisfies MusterParams,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    start: { label: 'Alarm time (UTC)' },
    passengers: { label: 'Passengers', help: 'Passengers on board, 10 to 10,000.' },
    crew: { label: 'Crew', help: 'Crew on board, 5 to 4,000.' },
    unaccountedPassengers: {
      label: 'Passengers unaccounted for',
      help: 'Passengers who do not reach a station on their own and are found later, 0 to 500.',
    },
    unaccountedCrew: {
      label: 'Crew unaccounted for',
      help: 'Crew who do not reach a station on their own and are found later, 0 to 200.',
    },
    lastFoundMin: {
      label: 'Last person found (minutes)',
      help: 'Latest minute after the alarm when the last person is found, 30 to 240.',
    },
  },
  generate(p) {
    const sim = simulateMuster(p)
    const end = sim.startMs + sim.completeMin * MIN
    const planted = sim.people.filter((x) => x.planted)
    const counts: { t: string; v: Record<string, number> }[] = []
    for (let m = 0; m <= sim.completeMin + 5; m += 5)
      counts.push({ t: iso(sim.startMs + m * MIN), v: { ...unaccountedAt(sim, m) } })
    return [
      {
        id: 'hosp-muster-events',
        label:
          'Simulated muster events: start, each person found later, all accounted for (for scoring)',
        kind: 'reports',
        range: range(sim.startMs, end),
        data: [
          eventEntry(sim.startMs, 'muster-start', 'muster_start', {
            passengers: sim.params.passengers,
            crew: sim.params.crew,
          }),
          ...planted.map((x) =>
            eventEntry(sim.startMs, `unaccounted-${x.code}`, 'person_unaccounted', {
              group: x.group,
              code: x.code,
              foundAfterMin: x.countedMin,
            }),
          ),
          eventEntry(end, 'all-accounted', 'all_accounted', { minutes: sim.completeMin }),
        ],
      },
      {
        id: 'hosp-muster-count',
        label: 'Simulated persons not yet accounted for, every 5 minutes',
        kind: 'series',
        unit: 'persons',
        range: range(sim.startMs, end),
        data: counts,
      },
      {
        id: 'hosp-muster-roster',
        label: 'Simulated roster of persons not at a station (codes only)',
        kind: 'reports',
        range: range(sim.startMs, end),
        data: planted.map((x) => ({
          t: iso(sim.startMs),
          title: x.code,
          text: [
            MARKING,
            `group: ${x.group}`,
            `last known: ${x.location}`,
            `found after: ${x.countedMin} minutes`,
          ].join('\n'),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- hurricane ----------------------------------------------------------------------------

export const hurricaneGenerator: SimulatedGenerator<ReturnType<typeof HurricaneParams.parse>> = {
  id: 'hosp-hurricane',
  label: 'Simulated hurricane approach: closures, winds and guest departures',
  params: HurricaneParams,
  description:
    'Simulates a hurricane approaching a resort property: the airport counter and causeway close, winds arrive, and guests depart along a curve set by how fast the front office starts. Writes the closure and wind events and cumulative guest departures by hour.',
  toolkits: ['guest_emergency', 'weather'],
  example: {
    seed: 1,
    start: '2026-09-17T12:00:00Z',
    guests: 600,
    airportClosesHour: 10,
    causewayClosesHour: 12,
    windsArriveHour: 14,
    startLagHours: 1,
    departureShare: 0.7,
  } satisfies HurricaneParams,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    start: { label: 'First advisory (UTC)', help: 'The advisory the plan reads first.' },
    guests: { label: 'Guests', help: 'Guests in house, 20 to 20,000.' },
    airportClosesHour: {
      label: 'Airport closes (hour)',
      help: 'Hours after the first advisory when the airport counter closes, 2 to 48.',
    },
    causewayClosesHour: {
      label: 'Causeway closes (hour)',
      help: 'Hours after the first advisory when the causeway closes, 2 to 48.',
    },
    windsArriveHour: {
      label: 'Winds arrive (hour)',
      help: 'Hours after the first advisory when tropical storm winds arrive, 4 to 72.',
    },
    startLagHours: {
      label: 'Departure start lag (hours)',
      help: 'Hours the front office takes to start departures, 0 to 12; shifts the whole curve.',
    },
    departureShare: {
      label: 'Share of guests who leave',
      help: 'Share of guests who leave if departures run well, 0.1 to 1.',
    },
  },
  generate(p) {
    const sim = simulateHurricane(p)
    const end = sim.startMs + sim.params.windsArriveHour * HOUR
    return [
      {
        id: 'hosp-hurricane-events',
        label: 'Simulated closure and wind events (for scoring)',
        kind: 'reports',
        range: range(sim.startMs, end),
        data: sim.closures.map((c) =>
          eventEntry(sim.startMs + c.hour * HOUR, c.id.replace(/_/g, '-'), c.id, {
            label: c.label,
          }),
        ),
      },
      {
        id: 'hosp-departures',
        label: 'Simulated cumulative guest departures by hour',
        kind: 'series',
        unit: 'guests',
        range: range(sim.startMs, end),
        data: sim.departed.map((d) => ({ t: iso(sim.startMs + d.hour * HOUR), v: d.guests })),
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- tower fire ---------------------------------------------------------------------------

const SNAPSHOT_MINUTES = [0, 10, 20, 30, 45, 60]

export const towerFireGenerator: SimulatedGenerator<ReturnType<typeof TowerFireParams.parse>> = {
  id: 'hosp-tower-fire',
  label: 'Simulated tower fire: floors, guests accounted for over time',
  params: TowerFireParams,
  description:
    'Simulates a fire in a hotel tower: the alarm, the fire department arriving, each floor cleared, and guests accounted for against a registered list that misses late check-ins. Writes the fire events and floor status snapshots at set minutes.',
  toolkits: ['guest_emergency'],
  example: {
    seed: 1,
    start: '2026-11-03T19:45:00Z',
    topFloor: 16,
    firstFloor: 10,
    fireFloor: 14,
    guestsPerFloor: 60,
    lateCheckIns: 4,
  } satisfies TowerFireParams,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    start: { label: 'Alarm time (UTC)' },
    topFloor: { label: 'Top floor', help: 'Highest guest floor, 6 to 60.' },
    firstFloor: { label: 'First guest floor', help: 'Lowest floor simulated, 2 to 20.' },
    fireFloor: { label: 'Fire floor', help: 'Floor where the fire starts, 3 to 60.' },
    guestsPerFloor: {
      label: 'Guests per floor',
      help: 'Registered guests on a typical floor, 10 to 200.',
    },
    lateCheckIns: {
      label: 'Late check-ins',
      help: 'Guests missing from the in-house list because they checked in late, 0 to 100.',
    },
  },
  generate(p) {
    const sim = simulateTowerFire(p)
    const lastMin = Math.max(...sim.floors.map((f) => f.clearMin + Math.ceil(f.lateFound * 3) + 1))
    const end = sim.startMs + lastMin * MIN
    return [
      {
        id: 'hosp-fire-events',
        label: 'Simulated fire events: alarm, fire department, each floor clear (for scoring)',
        kind: 'reports',
        range: range(sim.startMs, end),
        data: [
          eventEntry(sim.startMs, 'fire-alarm', 'fire_alarm', { floor: sim.params.fireFloor }),
          eventEntry(
            sim.startMs + 7 * MIN,
            'fire-department-arrives',
            'fire_department_arrival',
            {},
          ),
          ...sim.floors.map((f) =>
            eventEntry(sim.startMs + f.clearMin * MIN, `floor-${f.floor}-clear`, 'floor_cleared', {
              floor: f.floor,
              registered: f.registered,
            }),
          ),
          eventEntry(end, 'all-accounted', 'all_accounted', { minutes: lastMin }),
        ].sort((a, b) => a.t.localeCompare(b.t)),
      },
      {
        id: 'hosp-floor-snapshots',
        label: 'Simulated floor status at set times (JSON, as the floor status figure takes it)',
        kind: 'reports',
        range: range(sim.startMs, end),
        data: SNAPSHOT_MINUTES.map((m) => ({
          t: iso(sim.startMs + m * MIN),
          title: `Minute ${m}`,
          text: JSON.stringify({
            minute: m,
            listLateCheckIns: sim.params.lateCheckIns,
            floors: floorStatusAt(sim, m),
          }),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- cyber outage -------------------------------------------------------------------------

export const cyberOutageGenerator: SimulatedGenerator<ReturnType<typeof CyberOutageParams.parse>> =
  {
    id: 'hosp-reservation-cyber',
    label: 'Simulated reservation and keycard outage timeline and desk queue',
    params: CyberOutageParams,
    description:
      'Simulates a cyber attack that takes down the reservation system and keycard encoders at a hotel, through the ransom note to restoration. Writes the outage events and the guests waiting at the front desk by hour.',
    toolkits: ['guest_emergency', 'governance'],
    example: {
      seed: 1,
      start: '2026-11-07T14:10:00Z',
      arrivalsPerHour: 45,
      keycardsRestoredHour: 9,
      reservationsRestoredHour: 30,
    } satisfies CyberOutageParams,
    fields: {
      seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
      start: { label: 'First symptom (UTC)' },
      arrivalsPerHour: {
        label: 'Arrivals per hour',
        help: 'Guests expected to arrive each hour during the outage, 5 to 500.',
      },
      keycardsRestoredHour: {
        label: 'Keycards restored (hour)',
        help: 'Hours after the first symptom when keycard encoding works again, 1 to 72.',
      },
      reservationsRestoredHour: {
        label: 'Reservations restored (hour)',
        help: 'Hours after the first symptom when the reservation system is back, 1 to 120.',
      },
    },
    generate(p) {
      const sim = simulateCyberOutage(p)
      const last = sim.events[sim.events.length - 1]!
      const end = sim.startMs + last.minute * MIN
      return [
        {
          id: 'hosp-cyber-events',
          label: 'Simulated outage events (for scoring)',
          kind: 'reports',
          range: range(sim.startMs, end),
          data: sim.events.map((e) =>
            eventEntry(sim.startMs + e.minute * MIN, e.id.replace(/_/g, '-'), e.kind, {
              note: e.note,
            }),
          ),
        },
        {
          id: 'hosp-desk-queue',
          label: 'Simulated guests waiting at the front desk, by hour',
          kind: 'series',
          unit: 'guests',
          range: range(sim.startMs, end),
          data: sim.queue.map((q) => ({ t: iso(sim.startMs + q.hour * HOUR), v: q.waiting })),
        },
      ] satisfies GeneratedDataset[]
    },
  }

export const HOSPITALITY_GENERATORS = [
  outbreakGenerator,
  musterGenerator,
  hurricaneGenerator,
  towerFireGenerator,
  cyberOutageGenerator,
] as const
