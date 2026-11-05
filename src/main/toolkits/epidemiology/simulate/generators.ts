// The epidemiology simulations as case-data generators (spec 0448 FR-10, spec 0457 FR-6..FR-9).
// Each generator is a pure function of its parameters; the framework labels the output
// simulated, so none of it can pass as historical. Line lists and contact rosters are fictional
// people and carry the exercise marking in every entry.
import { z } from 'zod'
import { DAY_MS, HOUR_MS } from '@shared/epidemiology/arithmetic'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { CompartmentParams, runCompartment } from './compartment'
import { CommonSourceParams, generateCommonSource } from './common-source'
import { ContactParams, generateContactNetwork } from './contacts'
import {
  DispensingParams,
  WastewaterParams,
  generateWastewater,
  runDispensing,
} from './wastewater-dispensing'

const MARKING = 'EXERCISE ONLY. Fictional person.'
const START = z.object({ startDate: z.iso.datetime().default('2026-10-01T00:00:00Z') })
const iso = (ms: number): string => new Date(ms).toISOString()

/** A ground-truth event as a text entry: the case data reports shape (see readGroundTruth). */
const eventEntry = (
  at: string,
  id: string,
  kind: string,
  attrs: Record<string, unknown> = {},
): { t: string; title: string; text: string } => ({
  t: at,
  title: id,
  text: JSON.stringify({ id, kind, attrs }),
})

const compartmentParams = z.intersection(CompartmentParams, START)
const compartmentGenerator: SimulatedGenerator<z.output<typeof compartmentParams>> = {
  id: 'epi-compartment',
  label: 'Simulated outbreak (SIR or SEIR model)',
  params: compartmentParams,
  generate(p) {
    const run = runCompartment(p)
    const t0 = Date.parse(p.startDate)
    const at = (day: number): string => iso(t0 + (day - 1) * DAY_MS)
    const end = iso(t0 + (run.days.length - 1) * DAY_MS)
    const range = { start: iso(t0), end }
    return [
      {
        id: 'epi-onsets',
        label: 'Simulated new cases per day (by onset)',
        kind: 'series',
        unit: 'cases per day',
        range,
        data: run.days.map((d) => ({
          t: at(d.day),
          v: {
            onsets: Math.round(d.newOnsets * 100) / 100,
            infections: Math.round(d.newInfections * 100) / 100,
          },
        })),
      },
      {
        id: 'epi-prevalence',
        label: 'Simulated people infectious at the end of each day',
        kind: 'series',
        unit: 'people',
        range,
        data: run.days.map((d) => ({ t: at(d.day), v: Math.round(d.prevalence * 100) / 100 })),
      },
    ] satisfies GeneratedDataset[]
  },
}

const commonSourceParams = CommonSourceParams
const commonSourceGenerator: SimulatedGenerator<z.output<typeof commonSourceParams>> = {
  id: 'epi-common-source',
  label: 'Simulated common-source outbreak (event, line list, attack rates)',
  params: commonSourceParams,
  generate(p) {
    const out = generateCommonSource(p)
    const first = out.cases[0]?.onsetMs ?? Date.parse(p.eventStart)
    const last = out.cases[out.cases.length - 1]?.onsetMs ?? first
    const range = { start: iso(first), end: iso(last) }
    const lineList = out.cases.map((c) => ({
      t: iso(c.onsetMs!),
      title: `${c.code} ${c.name}`,
      text: [
        MARKING,
        `status: ${c.status}`,
        `age: ${c.age}`,
        `sex: ${c.sex}`,
        `onset: ${iso(c.onsetMs!)}`,
        `reported: ${iso(c.reportedMs!)}`,
        `ate: ${
          Object.entries(c.ate)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(', ') || 'none listed'
        }`,
      ].join('\n'),
    }))
    const attack = out.associations.map((a) => ({
      t: iso(Date.parse(p.eventStart)),
      title: a.food,
      text: `${MARKING}\nill and ate ${a.a}; well and ate ${a.b}; ill and did not eat ${a.c}; well and did not eat ${a.d}\nodds ratio ${a.oddsRatio === null ? 'n/a' : a.oddsRatio.toFixed(1)}`,
    }))
    const reported = out.cases.map((c) => c.reportedMs!).sort((a, b) => a - b)
    const events = [
      ...(reported.length ? [eventEntry(iso(reported[0]!), 'first-report', 'first_report')] : []),
      ...out.cases.map((c) =>
        eventEntry(iso(c.onsetMs!), `onset-${c.code}`, 'case_onset', {
          reportedAt: iso(c.reportedMs!),
        }),
      ),
    ]
    return [
      {
        id: 'epi-case-events',
        label: 'Simulated case events: first report and each onset (for scoring)',
        kind: 'reports',
        range,
        data: events,
      },
      {
        id: 'epi-line-list',
        label: 'Simulated line list (fictional people)',
        kind: 'reports',
        range,
        data: lineList,
      },
      {
        id: 'epi-attack-rates',
        label: 'Simulated attack rates by food',
        kind: 'reports',
        range,
        data: attack,
      },
    ] satisfies GeneratedDataset[]
  },
}

const contactParams = ContactParams
const contactGenerator: SimulatedGenerator<z.output<typeof contactParams>> = {
  id: 'epi-contacts',
  label: 'Simulated contact network (settings, close contacts, reachability)',
  params: contactParams,
  generate(p) {
    const net = generateContactNetwork(p)
    const t = p.notificationAt
    return [
      {
        id: 'epi-contact-events',
        label: 'Simulated contact listing events (for scoring)',
        kind: 'reports',
        range: { start: t, end: iso(Date.parse(t) + 21 * DAY_MS) },
        data: net.contacts.map((c) =>
          eventEntry(t, `contact-${c.code}`, 'contact_listed', { contact: c.code, close: c.close }),
        ),
      },
      {
        id: 'epi-contact-roster',
        label: 'Simulated contact roster (fictional people)',
        kind: 'reports',
        range: { start: t, end: iso(Date.parse(t) + 21 * DAY_MS) },
        data: net.contacts.map((c) => ({
          t: iso(c.exposureStartMs),
          title: `${c.code} ${c.name}`,
          text: [
            MARKING,
            `setting: ${c.setting}`,
            `overlap with infectious period: ${c.overlapMinutes} min`,
            `classification: ${c.close ? 'close contact' : 'not a close contact'}`,
            `reached: ${c.reachedOnDay === null ? 'not reachable' : `day ${c.reachedOnDay} after notification`}`,
            `monitor from ${iso(c.monitorFromMs)} to ${iso(c.monitorToMs)}`,
          ].join('\n'),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

const wastewaterParams = z.intersection(WastewaterParams, START)
const wastewaterGenerator: SimulatedGenerator<z.output<typeof wastewaterParams>> = {
  id: 'epi-wastewater',
  label: 'Simulated wastewater signal (from a daily case curve)',
  params: wastewaterParams,
  generate(p) {
    const points = generateWastewater(p)
    const t0 = Date.parse(p.startDate)
    return [
      {
        id: 'epi-wastewater-signal',
        label: 'Simulated wastewater concentration (simulated scale, not a public data scale)',
        kind: 'series',
        unit: 'relative units',
        range: { start: iso(t0), end: iso(t0 + (points.length - 1) * DAY_MS) },
        data: points.map((q) => ({ t: iso(t0 + q.day * DAY_MS), v: q.concentration })),
      },
    ] satisfies GeneratedDataset[]
  },
}

const dispensingParams = z.intersection(
  DispensingParams,
  z.object({
    openAt: z.iso.datetime().default('2026-10-22T14:00:00Z'),
    site: z.string().min(1).max(40).default('POD 1'),
  }),
)
const dispensingGenerator: SimulatedGenerator<z.output<typeof dispensingParams>> = {
  id: 'epi-dispensing',
  label: 'Simulated dispensing site (arrivals, stations, queue)',
  params: dispensingParams,
  generate(p) {
    const run = runDispensing(p)
    const t0 = Date.parse(p.openAt)
    return [
      {
        id: 'epi-dispensing-events',
        label: 'Simulated dispensing activation (for scoring)',
        kind: 'reports',
        range: { start: p.openAt, end: p.openAt },
        data: [eventEntry(p.openAt, `activation-${p.site}`, 'mcm_activation', { site: p.site })],
      },
      {
        id: 'epi-dispensing-flow',
        label: 'Simulated dispensing site flow',
        kind: 'series',
        unit: 'people per interval',
        range: { start: iso(t0), end: iso(t0 + p.hoursOpen * HOUR_MS) },
        data: run.intervals.map((i) => ({
          t: iso(t0 + i.startMin * 60_000),
          v: { arrivals: i.arrivals, served: i.served, queue: i.queueEnd },
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

export const EPI_GENERATORS: readonly SimulatedGenerator<never>[] = [
  compartmentGenerator,
  commonSourceGenerator,
  contactGenerator,
  wastewaterGenerator,
  dispensingGenerator,
] as unknown as readonly SimulatedGenerator<never>[]
