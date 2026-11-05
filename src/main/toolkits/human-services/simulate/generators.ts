// The human services simulations as case-data generators (spec 0448 FR-10, spec 0464 FR-9).
// Each generator is a pure function of its parameters; the framework labels the output simulated,
// so none of it can pass as historical. Every dataset label also says "simulated". The ground
// truth events and modeled series are what the service level, time to completion, needs coverage
// and threshold timing metrics read, so the dataset ids below are part of the toolkits' contract.
import type { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import {
  CHANNEL_LABEL,
  CONTACT_CHANNELS,
  SurgeParams,
  channelIntervals,
  runSurge,
} from './contact-surge'
import { DisplacedParams, PLACEMENTS, STATUSES, countsAt, runDisplaced } from './displaced'
import { ReunificationParams, flowPoints, runReunification } from './reunification'
import { NEED_LABEL, ShelterParams, runShelters } from './shelter'

/** Dataset ids the metrics and the toolkits' `series` and `groundTruth` settings name. */
export const HS_DATASETS = {
  contactQueue: 'hs-contact-queue',
  contactEvents: 'hs-contact-events',
  shelterPopulation: 'hs-shelter-population',
  shelterEvents: 'hs-shelter-events',
  shelterHazard: 'hs-shelter-hazard',
  reunificationEvents: 'hs-reunification-events',
  reunificationFlow: 'hs-reunification-flow',
  displacedEvents: 'hs-displaced-events',
  displacedStatus: 'hs-displaced-status',
} as const

const MIN_MS = 60_000
const HOUR_MS = 3_600_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

interface Ev {
  id: string
  time: string
  kind: string
  area?: string
  attrs: Record<string, unknown>
}

// ---- contact surge -----------------------------------------------------------------------------

const QUANTITIES = [
  ['offered', 'offered'],
  ['answered', 'answered'],
  ['abandoned', 'abandoned'],
  ['rerouted', 'rerouted'],
  ['avg_wait_sec', 'avgWaitSec'],
  ['longest_wait_sec', 'longestWaitSec'],
  ['queue', 'queueEnd'],
  ['staff_on', 'staffOn'],
] as const

const surgeGenerator: SimulatedGenerator<z.output<typeof SurgeParams>> = {
  id: 'hs-contact-surge',
  label: 'Simulated crisis line contact surge',
  params: SurgeParams,
  generate(p) {
    const run = runSurge(p)
    const t0 = Date.parse(p.startTime)
    const at = (min: number): string => iso(t0 + min * MIN_MS)
    const series = CONTACT_CHANNELS.flatMap((ch) =>
      QUANTITIES.map(([quantity, key]) => ({
        zone: CHANNEL_LABEL[ch],
        quantity,
        points: channelIntervals(run, ch).map((i) => ({ time: at(i.startMin), value: i[key] })),
      })),
    )
    const events: Ev[] = [
      {
        id: 'hs-surge-start',
        time: iso(t0 + p.surgeStartHour * HOUR_MS),
        kind: 'surge_start',
        attrs: { multiplier: p.multiplier, simulated: true },
      },
      {
        id: 'hs-staff-shortfall',
        time: iso(t0 + p.shortfall.startHour * HOUR_MS),
        kind: 'staff_shortfall',
        attrs: { counselors: p.shortfall.counselors, durationHours: p.shortfall.durationHours },
      },
    ]
    for (const ch of CONTACT_CHANNELS) {
      const rows = channelIntervals(run, ch)
      const timer = ch === 'calls' ? p.rerouting.callSec : p.rerouting.textChatSec
      const over = rows.find((r) => r.longestWaitSec > timer)
      if (over)
        events.push({
          id: `hs-queue-over-timer-${ch}`,
          time: at(over.startMin),
          area: CHANNEL_LABEL[ch],
          kind: 'queue_over_timer',
          attrs: { channel: ch, timerSec: timer, longestWaitSec: over.longestWaitSec },
        })
      const first = rows.find((r) => r.rerouted > 0)
      if (first)
        events.push({
          id: `hs-reroute-began-${ch}`,
          time: at(first.startMin),
          area: CHANNEL_LABEL[ch],
          kind: 'reroute_began',
          attrs: { channel: ch, rerouted: first.rerouted },
        })
    }
    const range = { start: iso(t0), end: iso(t0 + p.hours * HOUR_MS) }
    return [
      {
        id: HS_DATASETS.contactQueue,
        label: 'Crisis line queue by contact type (simulated)',
        kind: 'series',
        shape: 'modeled-series',
        range,
        data: series,
      },
      {
        id: HS_DATASETS.contactEvents,
        label: 'Crisis line surge events (simulated)',
        kind: 'reports',
        shape: 'ground-truth',
        range,
        data: events,
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- shelters ----------------------------------------------------------------------------------

const shelterGenerator: SimulatedGenerator<z.output<typeof ShelterParams>> = {
  id: 'hs-shelter-population',
  label: 'Simulated shelter population and needs',
  params: ShelterParams,
  generate(p) {
    const run = runShelters(p)
    const t0 = Date.parse(p.startTime)
    const at = (hour: number): string => iso(t0 + hour * HOUR_MS)
    const series = [
      ...p.sites.map((s) => ({
        zone: s.name,
        quantity: 'population',
        points: run.population[s.name]!.map((v, h) => ({ time: at(h + 1), value: v })),
      })),
      ...p.sites.map((s) => ({
        zone: s.name,
        quantity: 'capacity',
        points: run.population[s.name]!.map((_, h) => ({
          time: at(h + 1),
          value: s.opensHour <= h ? s.capacity : 0,
        })),
      })),
    ]
    const events: Ev[] = [
      {
        id: 'hs-hazard-arrival',
        time: at(p.hazardArrivalHour),
        kind: 'hazard_arrival',
        attrs: { simulated: true },
      },
      ...(run.demandExceedsCapacityHour !== undefined
        ? [
            {
              id: 'hs-demand-exceeds-capacity',
              time: at(run.demandExceedsCapacityHour),
              kind: 'demand_exceeds_capacity',
              attrs: { turnedAway: run.turnedAway },
            },
          ]
        : []),
      ...run.needs.map((n): Ev => ({
        id: n.id,
        time: at(n.hour),
        area: n.site,
        kind: 'need_recorded',
        attrs: { category: n.category, label: NEED_LABEL[n.category], resident: n.resident },
      })),
    ]
    const range = { start: iso(t0), end: at(p.hours) }
    // Wind at each shelter site (one county-wide track) rises to tropical-storm force (39 mph) at the hazard arrival hour.
    const wind = Array.from({ length: Math.floor(p.hours) + 1 }, (_, h) => ({
      time: at(h),
      value:
        h <= p.hazardArrivalHour
          ? Math.round((15 + (24 * h) / Math.max(1, p.hazardArrivalHour)) * 10) / 10
          : Math.min(120, Math.round((39 + 6 * (h - p.hazardArrivalHour)) * 10) / 10),
    }))
    return [
      {
        id: HS_DATASETS.shelterHazard,
        label: 'Hazard wind at each shelter site, mph (simulated)',
        kind: 'series',
        shape: 'modeled-series',
        unit: 'mph',
        range,
        data: p.sites.map((s) => ({ zone: s.name, quantity: 'wind_mph', points: wind })),
      },
      {
        id: HS_DATASETS.shelterPopulation,
        label: 'Shelter population and capacity (simulated)',
        kind: 'series',
        shape: 'modeled-series',
        range,
        data: series,
      },
      {
        id: HS_DATASETS.shelterEvents,
        label: 'Shelter events and needs (simulated)',
        kind: 'reports',
        shape: 'ground-truth',
        range,
        data: events,
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- reunification -----------------------------------------------------------------------------

const reunificationGenerator: SimulatedGenerator<z.output<typeof ReunificationParams>> = {
  id: 'hs-reunification-flow',
  label: 'Simulated reunification arrivals and verification',
  params: ReunificationParams,
  generate(p) {
    const run = runReunification(p)
    const t0 = Date.parse(p.startTime)
    const at = (min: number): string => iso(t0 + min * MIN_MS)
    const events: Ev[] = [
      {
        id: 'hs-site-activated',
        time: at(0),
        kind: 'site_activated',
        attrs: { students: p.students },
      },
      ...run.students.flatMap((s): Ev[] => [
        {
          id: `hs-student-${s.ref}`,
          time: at(0),
          kind: 'student',
          attrs: {
            ref: s.ref,
            grade: s.grade,
            unaccompanied: s.unaccompanied,
            exception: s.exception,
          },
        },
        ...(s.arrivalMin !== undefined
          ? [
              {
                id: `hs-guardian-${s.ref}`,
                time: at(s.arrivalMin),
                kind: 'guardian_arrived',
                attrs: { ref: s.ref },
              },
            ]
          : []),
        ...(s.releaseReadyMin !== undefined
          ? [
              {
                id: `hs-ready-${s.ref}`,
                time: at(s.releaseReadyMin),
                kind: 'release_ready',
                attrs: { ref: s.ref },
              },
            ]
          : []),
      ]),
    ]
    const flow = flowPoints(run)
    return [
      {
        id: HS_DATASETS.reunificationEvents,
        label: 'Reunification site events (simulated)',
        kind: 'reports',
        shape: 'ground-truth',
        range: { start: at(0), end: at(flow[flow.length - 1]!.minute) },
        data: events,
      },
      {
        id: HS_DATASETS.reunificationFlow,
        label: 'Reunification flow, cumulative counts (simulated)',
        kind: 'series',
        unit: 'students and guardians',
        range: { start: at(0), end: at(flow[flow.length - 1]!.minute) },
        data: flow.map((f) => ({
          t: at(f.minute),
          v: {
            arrived: f.arrived,
            verified: f.verified,
            released: f.released,
            exceptions: f.exceptions,
          },
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- displaced children ------------------------------------------------------------------------

const displacedGenerator: SimulatedGenerator<z.output<typeof DisplacedParams>> = {
  id: 'hs-displaced-children',
  label: 'Simulated displaced children in care',
  params: DisplacedParams,
  generate(p) {
    const run = runDisplaced(p)
    const t0 = Date.parse(p.startTime)
    const at = (hour: number): string => iso(t0 + hour * HOUR_MS)
    const events: Ev[] = [
      {
        id: 'hs-plan-activated',
        time: at(0),
        kind: 'plan_activated',
        attrs: { children: p.children },
      },
      ...run.children.flatMap((c): Ev[] => [
        {
          id: `hs-child-${c.code}`,
          time: at(0),
          area: c.county,
          kind: 'child_in_care',
          attrs: { code: c.code, placement: c.placement },
        },
        ...(c.locatedHour !== undefined
          ? [
              {
                id: `hs-locatable-${c.code}`,
                time: at(c.locatedHour),
                area: c.county,
                kind: 'child_locatable',
                attrs: { code: c.code, outcome: c.outcome },
              },
            ]
          : []),
      ]),
    ]
    const status: { t: string; v: Record<string, number> }[] = []
    for (let h = 0; h <= p.hours; h += 6) {
      const byPlacement = countsAt(run, h)
      const v: Record<string, number> = {}
      for (const s of STATUSES) v[s] = PLACEMENTS.reduce((a, pl) => a + byPlacement[pl][s], 0)
      status.push({ t: at(h), v })
    }
    return [
      {
        id: HS_DATASETS.displacedEvents,
        label: 'Displaced children in care, events (simulated)',
        kind: 'reports',
        shape: 'ground-truth',
        range: { start: at(0), end: at(p.hours) },
        data: events,
      },
      {
        id: HS_DATASETS.displacedStatus,
        label: 'Displaced children by status, every six hours (simulated)',
        kind: 'series',
        unit: 'children',
        range: { start: at(0), end: at(p.hours) },
        data: status,
      },
    ] satisfies GeneratedDataset[]
  },
}

export const HS_GENERATORS = [
  surgeGenerator,
  shelterGenerator,
  reunificationGenerator,
  displacedGenerator,
] as const
