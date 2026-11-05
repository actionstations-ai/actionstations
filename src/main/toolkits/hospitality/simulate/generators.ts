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
