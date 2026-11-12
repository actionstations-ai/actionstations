// A power shutoff scenario kit (spec 0461 FR-11): fictional circuits with customers by class,
// medical baseline customers and critical facilities, a gust series per circuit with a threshold,
// a patrol and restoration sequence, and the notification windows of the example rule. All
// names, counts and facilities are invented; the kit never reads or writes a real customer or
// circuit record. Deterministic from a seed.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { DEFAULT_WINDOWS } from '../windows'

const HOUR_MS = 3_600_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const r1 = (v: number): number => Math.round(v * 10) / 10

/** A small deterministic generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FACILITY_KINDS = ['hospital', 'care_home', 'water', 'cell_site', 'other'] as const

const Circuit = z.object({
  id: z.string().min(1).max(40),
  area: z.string().min(1).max(100),
  customers: z.object({
    residential: z.number().int().min(0).max(200_000),
    commercial: z.number().int().min(0).max(50_000).default(0),
    agricultural: z.number().int().min(0).max(50_000).default(0),
  }),
  medicalBaseline: z.number().int().min(0).max(50_000).default(0),
  critical: z
    .array(z.object({ name: z.string().min(1).max(100), kind: z.enum(FACILITY_KINDS) }))
    .max(10)
    .default([]),
  /** Gust speed in mph above which the circuit meets the shutoff criteria. */
  gustThresholdMph: z.number().min(20).max(90).default(45),
})

export const ShutoffEventParams = z
  .object({
    utility: z.string().min(1).max(80),
    /** When gusts first reach the threshold on the first circuit. */
    eventStart: IsoDateTime,
    eventHours: z.number().min(4).max(72).default(18),
    peakGustMph: z.number().min(30).max(100).default(58),
    seed: z.number().int().min(0).max(1_000_000).default(1),
    /** Fictional circuits are made when none are given. */
    circuitCount: z.number().int().min(1).max(12).default(5),
    circuits: z.array(Circuit).max(20).default([]),
    /** Hours a patrol takes before a circuit can be restored. */
    patrolHours: z.number().min(0.5).max(12).default(3),
    stepMinutes: z.number().int().min(10).max(120).default(30),
  })
  .refine((p) => new Set(p.circuits.map((c) => c.id)).size === p.circuits.length, {
    message: 'circuit ids must be unique',
  })
export type ShutoffEventParams = z.infer<typeof ShutoffEventParams>
type CircuitSpec = z.infer<typeof Circuit>

const AREAS = [
  'Cinder Canyon and Ridgeview',
  'Pine Hollow',
  'Upper Mill Road',
  'Mill Valley',
  'Oak Flat',
  'Quarry Hill',
  'Juniper Bench',
  'Calloway Falls north',
  'Calloway Falls east',
  'Sage Basin',
  'Fox Meadow',
  'Granite Rim',
]
const FACILITIES: { name: string; kind: (typeof FACILITY_KINDS)[number] }[] = [
  { name: 'Mill Creek Care Home', kind: 'care_home' },
  { name: 'Water booster station 4', kind: 'water' },
  { name: 'Cell site CS-12', kind: 'cell_site' },
  { name: 'Calloway Regional Hospital annex', kind: 'hospital' },
  { name: 'Water booster station 7', kind: 'water' },
  { name: 'Cell site CS-19', kind: 'cell_site' },
]

/** Fictional circuits from a seed: ids C-101 and up, with sensible counts. */
export function makeCircuits(count: number, seed: number): CircuitSpec[] {
  const rand = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const residential = Math.round(300 + rand() * 2700)
    const critical = rand() < 0.6 ? [FACILITIES[Math.floor(rand() * FACILITIES.length)]!] : []
    return {
      id: `C-${101 + i * 7}`,
      area: AREAS[i % AREAS.length]!,
      customers: {
        residential,
        commercial: Math.round(residential * (0.04 + rand() * 0.08)),
        agricultural: Math.round(rand() * 40),
      },
      medicalBaseline: Math.max(1, Math.round(residential * (0.02 + rand() * 0.03))),
      critical,
      gustThresholdMph: 45,
    }
  })
}

/** Gust at an hour into the event: a half-sine bump over the event hours on top of 12 mph. */
export function gustAt(hour: number, hours: number, peak: number, offsetH: number): number {
  const t = (hour - offsetH) / hours
  if (t <= 0 || t >= 1) return 12
  return 12 + (peak - 12) * Math.sin(Math.PI * t)
}

export function generateShutoff(p: ShutoffEventParams): GeneratedDataset[] {
  const rand = rng(p.seed + 7)
  const circuits = p.circuits.length ? p.circuits : makeCircuits(p.circuitCount, p.seed)
  const startMs = Date.parse(p.eventStart)
  const hours = p.eventHours
  // Each circuit sees the wind a little later and a little different.
  const plan = circuits.map((c, i) => ({
    c,
    offsetH: i * 0.5,
    peak: Math.round(p.peakGustMph * (0.88 + rand() * 0.12)),
  }))
  const lead = 6
  const sampleStart = startMs - lead * HOUR_MS
  const end = startMs + (hours + circuits.length * 0.5 + p.patrolHours + 2) * HOUR_MS
  const times: number[] = []
  for (let t = sampleStart; t <= end; t += p.stepMinutes * 60_000) times.push(t)
  const range = { start: iso(sampleStart), end: iso(end) }

  const gust = (i: number, t: number): number =>
    r1(gustAt((t - startMs) / HOUR_MS, hours, plan[i]!.peak, plan[i]!.offsetH))
  const crossing = (i: number): number | null => {
    for (let k = 0; k < times.length; k++) {
      const v = gust(i, times[k]!)
      if (v >= plan[i]!.c.gustThresholdMph) {
        if (k === 0) return times[0]!
        const a = gust(i, times[k - 1]!)
        const f = (plan[i]!.c.gustThresholdMph - a) / (v - a)
        return Math.round(times[k - 1]! + f * (times[k]! - times[k - 1]!))
      }
    }
    return null
  }
  const deenergize = plan.map((_, i) => crossing(i))
  const first = deenergize.find((d): d is number => d !== null) ?? startMs
  // Winds fall below the threshold again after the bump; patrols start then.
  const fallsBelow = (i: number): number => {
    for (let k = times.length - 1; k >= 0; k--)
      if (gust(i, times[k]!) >= plan[i]!.c.gustThresholdMph) return times[k]!
    return startMs
  }

  const circuitEvents = plan.flatMap(({ c }, i) => {
    const d = deenergize[i]
    const total = c.customers.residential + c.customers.commercial + c.customers.agricultural
    const restored = fallsBelow(i) + p.patrolHours * HOUR_MS * (1 + i * 0.12)
    return [
      {
        id: `circuit-${c.id}`,
        time: iso(d ?? startMs),
        area: c.id,
        kind: 'circuit',
        attrs: {
          area: c.area,
          customers: total,
          residential: c.customers.residential,
          commercial: c.customers.commercial,
          agricultural: c.customers.agricultural,
          medicalBaseline: c.medicalBaseline,
          critical: c.critical.map((f) => f.name),
          gustThresholdMph: c.gustThresholdMph,
          meetsCriteria: d !== null,
          basis: 'simulated',
        },
      },
      {
        id: `medical-baseline-${c.id}`,
        time: iso(d ?? startMs),
        area: c.id,
        kind: 'medical_baseline_group',
        attrs: { customers: c.medicalBaseline, basis: 'simulated' },
      },
      ...c.critical.map((f, k) => ({
        id: `critical-${c.id}-${k}`,
        time: iso(d ?? startMs),
        area: c.id,
        kind: 'critical_facility',
        attrs: { name: f.name, facilityKind: f.kind, basis: 'simulated' },
      })),
      {
        id: `restored-${c.id}`,
        time: iso(restored),
        area: c.id,
        kind: 'circuit_restored',
        attrs: { patrolHours: p.patrolHours, basis: 'simulated' },
      },
    ]
  })

  const windowEvents = DEFAULT_WINDOWS.map((w) => ({
    id: `window-${w.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    time: iso(first - w.minHoursBefore * HOUR_MS),
    area: w.audience,
    kind: 'notification_window',
    attrs: {
      label: w.label,
      audience: w.audience,
      earliest: iso(first - w.maxHoursBefore * HOUR_MS),
      latest: iso(first - w.minHoursBefore * HOUR_MS),
      deenergizeAt: iso(first),
      basis: 'simulated example rule',
    },
  }))
  windowEvents.push({
    id: 'window-at-deenergization',
    time: iso(first),
    area: 'all',
    kind: 'notification_window',
    attrs: {
      label: 'At de-energization',
      audience: 'all',
      earliest: iso(first - HOUR_MS),
      latest: iso(first + 30 * 60_000),
      deenergizeAt: iso(first),
      basis: 'simulated example rule',
    },
  })

  return [
    {
      id: 'sim-psps-circuits',
      label: `${p.utility} circuits, customers and restoration, simulated (fictional data)`,
      kind: 'reports',
      shape: 'ground-truth',
      range,
      data: circuitEvents,
    },
    {
      id: 'sim-psps-windows',
      label: `${p.utility} notification windows, simulated example rule`,
      kind: 'reports',
      shape: 'ground-truth',
      range,
      data: windowEvents,
    },
    {
      id: 'sim-psps-gust-margin',
      label: `${p.utility} gust speed above the shutoff threshold by circuit, simulated`,
      kind: 'series',
      shape: 'modeled-series',
      range,
      unit: 'mph',
      data: plan.map(({ c }, i) => ({
        zone: c.id,
        quantity: 'gust in mph above the circuit shutoff threshold',
        points: times.map((t) => ({
          time: iso(t),
          value: r1(gust(i, t) - c.gustThresholdMph),
        })),
      })),
    },
    {
      id: 'sim-psps-gusts',
      label: `${p.utility} gusts by circuit, simulated`,
      kind: 'series',
      range,
      unit: 'mph',
      data: times.map((t) => ({
        t: iso(t),
        v: Object.fromEntries(plan.map(({ c }, i) => [c.id, gust(i, t)])),
      })),
    },
  ]
}

export const shutoffEventGenerator: SimulatedGenerator<ShutoffEventParams> = {
  id: 'wildfire-shutoff-event',
  label: 'Power shutoff event (simulated, fictional circuits and customers)',
  params: ShutoffEventParams,
  description:
    'A public safety power shutoff for a fictional utility: circuits with customers by class, medical baseline customers and critical facilities, a gust series per circuit against its threshold, patrol and restoration times, and the notification windows. Writes the circuits, gust series and windows the shutoff measures read.',
  toolkits: ['wildfire'],
  example: {
    utility: 'Pinecrest Valley Electric',
    eventStart: '2026-10-10T22:30:00Z',
    eventHours: 16,
    peakGustMph: 58,
    seed: 4,
    circuitCount: 2,
    circuits: [
      {
        id: 'PV-1101',
        area: 'Cinder Canyon and Ridgeview',
        customers: { residential: 2400, commercial: 120, agricultural: 35 },
        medicalBaseline: 64,
        critical: [{ name: 'Ridgeview Water Pump Station', kind: 'water' }],
        gustThresholdMph: 45,
      },
      {
        id: 'PV-1102',
        area: 'Pine Hollow',
        customers: { residential: 1300, commercial: 40, agricultural: 80 },
        medicalBaseline: 31,
        critical: [{ name: 'Pine Hollow Care Home', kind: 'care_home' }],
        gustThresholdMph: 50,
      },
    ],
    patrolHours: 3,
    stepMinutes: 30,
  } satisfies z.input<typeof ShutoffEventParams>,
  fields: {
    utility: { label: 'Utility', help: 'Fictional utility name.' },
    eventStart: {
      label: 'Gusts reach threshold (UTC)',
      help: 'When gusts first reach the threshold on the first circuit.',
    },
    eventHours: { label: 'Event length (hours)', help: '4 to 72.' },
    peakGustMph: { label: 'Peak gust (mph)', help: '30 to 100.' },
    seed: {
      label: 'Seed',
      help: 'Any whole number; the same seed gives the same circuits and gusts.',
    },
    circuitCount: {
      label: 'Circuits to make',
      help: 'Fictional circuits made when none are given below, 1 to 12.',
    },
    circuits: {
      label: 'Circuits',
      help: 'Optional. Each item: id, area, customers (residential, commercial, agricultural), medicalBaseline, critical facilities (name, kind: hospital, care_home, water, cell_site or other) and gustThresholdMph. Ids must be unique.',
    },
    patrolHours: {
      label: 'Patrol (hours)',
      help: 'Hours a patrol takes before a circuit can be restored, 0.5 to 12.',
    },
    stepMinutes: { label: 'Step (minutes)', help: 'Minutes between gust readings, 10 to 120.' },
  },
  generate: generateShutoff,
}
