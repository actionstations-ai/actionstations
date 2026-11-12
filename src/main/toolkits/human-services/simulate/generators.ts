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
  description:
    'Simulates a crisis line contact surge across calls, texts and chats: the surge rises and decays, counselors call out, contacts reroute after the network timers and some give up. Writes the queue by contact type at each interval and the surge, staffing, timer and rerouting events.',
  toolkits: ['crisis_line'],
  example: {
    seed: 1,
    startTime: '2026-11-03T12:00:00Z',
    hours: 12,
    intervalMin: 15,
    baselinePerHour: { calls: 60, texts: 35, chats: 12 },
    surgeStartHour: 4,
    multiplier: 2,
    decayHours: 8,
    counselors: { calls: 11, texts: 7, chats: 3 },
    shortfall: { counselors: 2, startHour: 5, durationHours: 6 },
    contactsPerCounselorHour: { calls: 5, texts: 4, chats: 4 },
    rerouting: { enabled: true, callSec: 120, textChatSec: 300, spanishShare: 0.08 },
    abandonAfterSec: { calls: 300, texts: 900, chats: 600 },
  } satisfies z.input<typeof SurgeParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    startTime: { label: 'Start (UTC)' },
    hours: { label: 'Hours simulated', help: '2 to 72 hours.' },
    intervalMin: { label: 'Interval (minutes)', help: 'Length of each reporting interval.' },
    baselinePerHour: {
      label: 'Baseline contacts per hour',
      help: 'Contacts per hour before the surge: an object with calls, texts and chats.',
    },
    surgeStartHour: { label: 'Surge starts (hour)', help: 'Hours after the start, 0 to 70.' },
    multiplier: {
      label: 'Surge multiplier',
      help: 'Peak calls as a multiple of baseline, 1 to 10; texts and chats surge a little harder.',
    },
    decayHours: {
      label: 'Surge decay (hours)',
      help: 'Hours for the surge excess to fall to 37 percent of its peak, 0.5 to 72.',
    },
    counselors: {
      label: 'Counselors',
      help: 'Counselors on each channel before any shortfall: an object with calls, texts and chats.',
    },
    shortfall: {
      label: 'Staff shortfall',
      help: 'Counselors lost to call-outs: an object with counselors, startHour and durationHours.',
    },
    contactsPerCounselorHour: {
      label: 'Contacts per counselor hour',
      help: 'Contacts one counselor handles per hour: an object with calls, texts and chats.',
    },
    rerouting: {
      label: 'Rerouting',
      help: 'An object with enabled, callSec and textChatSec (seconds before a contact reroutes) and spanishShare (share of contacts in Spanish, which cannot reroute).',
    },
    abandonAfterSec: {
      label: 'Abandon after (seconds)',
      help: 'Seconds after which a waiting contact gives up: an object with calls, texts and chats.',
    },
  },
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
  description:
    'Simulates evacuees arriving at shelters that open in turn, with residents who have functional and access needs and a hazard that reaches the county. Writes shelter population against capacity, hazard wind at each site, and the shelter events and needs recorded.',
  toolkits: ['mass_care'],
  example: {
    seed: 1,
    startTime: '2026-11-02T12:00:00Z',
    hours: 48,
    sites: [
      { name: 'Eastside High School (simulated)', capacity: 220, opensHour: 2 },
      { name: 'Ridge Middle School (simulated)', capacity: 300, opensHour: 8 },
    ],
    evacuees: 400,
    peakHour: 14,
    spreadHours: 6,
    hazardArrivalHour: 18,
    needsRates: {
      electricity_for_medical_equipment: 0.04,
      communication_access: 0.03,
      personal_assistance: 0.05,
      medication_support: 0.08,
      supervision: 0.015,
    },
  } satisfies z.input<typeof ShelterParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    startTime: { label: 'Start (UTC)' },
    hours: { label: 'Hours simulated', help: '6 to 240 hours.' },
    sites: {
      label: 'Shelters',
      help: 'Shelters in the order they fill. Each item: name, capacity and opensHour (hours after the start).',
    },
    evacuees: { label: 'Evacuees', help: 'People who come to the shelters, 10 to 50,000.' },
    peakHour: { label: 'Peak arrivals (hour)', help: 'Hours after the start when arrivals peak.' },
    spreadHours: {
      label: 'Arrival spread (hours)',
      help: 'Standard deviation of arrivals around the peak, 1 to 48 hours.',
    },
    hazardArrivalHour: {
      label: 'Hazard arrives (hour)',
      help: 'Hours after the start when the hazard reaches the county.',
    },
    needsRates: {
      label: 'Share of residents with each need',
      help: 'An object of shares from 0 to 1: electricity_for_medical_equipment, communication_access, personal_assistance, medication_support and supervision.',
    },
  },
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
  description:
    'Simulates a school reunification: guardians arrive over time, check-in leads verify identity, students are released, and some guardians cannot be verified or never arrive. Writes the site events and cumulative arrival, verification and release counts.',
  toolkits: ['reunification_child_welfare'],
  example: {
    seed: 1,
    startTime: '2026-11-03T15:10:00Z',
    students: 120,
    medianArrivalMin: 35,
    arrivalSigma: 0.6,
    checkInLeads: 4,
    verifyMedianMin: 2,
    unverifiableShare: 0.04,
    unaccompaniedShare: 0.03,
    retrievalMin: 5,
  } satisfies z.input<typeof ReunificationParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    startTime: { label: 'Site activated (UTC)' },
    students: { label: 'Students', help: 'Students at the reunification site, 5 to 2,000.' },
    medianArrivalMin: {
      label: 'Median guardian arrival (minutes)',
      help: 'Median minutes after activation when a guardian arrives.',
    },
    arrivalSigma: {
      label: 'Arrival spread',
      help: 'Log-scale spread of arrivals, 0.1 to 2; larger means a longer tail.',
    },
    checkInLeads: {
      label: 'Check-in leads',
      help: 'Staff verifying identity at the same time, 1 to 50.',
    },
    verifyMedianMin: {
      label: 'Median verification (minutes)',
      help: 'Median minutes one verification takes.',
    },
    unverifiableShare: {
      label: 'Share unverifiable',
      help: 'Share of guardians who cannot be verified at the desk, 0 to 1.',
    },
    unaccompaniedShare: {
      label: 'Share with no guardian',
      help: 'Share of students for whom no guardian arrives within the exercise, 0 to 1.',
    },
    retrievalMin: {
      label: 'Retrieval (minutes)',
      help: 'Minutes from verification to release, 0 to 60.',
    },
  },
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
  description:
    'Simulates children in foster care and other placements displaced by a disaster, located over time at a pace that depends on the placement type, with a share never located. Writes the plan and location events and the count of children by status.',
  toolkits: ['reunification_child_welfare'],
  example: {
    seed: 1,
    startTime: '2026-11-04T08:00:00Z',
    children: 86,
    placementMix: [0.5, 0.25, 0.15, 0.1],
    counties: ['Bayfront', 'Ridge'],
    midpointHours: 20,
    neverLocatedShare: 0.06,
    hours: 72,
  } satisfies z.input<typeof DisplacedParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    startTime: { label: 'Plan activated (UTC)' },
    children: { label: 'Children in care', help: 'Children to locate, 5 to 5,000.' },
    placementMix: {
      label: 'Placement mix',
      help: 'Four shares in the order foster home, kinship, group home, other; they should add to 1.',
    },
    counties: { label: 'Counties', help: 'One county name per line, 1 to 8.' },
    midpointHours: {
      label: 'Half located (hours)',
      help: 'Hour when half the located foster home children are located, 1 to 240.',
    },
    neverLocatedShare: {
      label: 'Share never located',
      help: 'Share of children not located within the run, 0 to 1.',
    },
    hours: { label: 'Hours simulated', help: '6 to 240 hours.' },
  },
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
