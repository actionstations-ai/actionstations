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
  description:
    'An outbreak in one population from an SIR or SEIR compartment model, with optional vaccination and an intervention that cuts transmission from a chosen day. It writes new cases per day by onset and the number of people infectious each day.',
  toolkits: ['epidemiology'],
  example: {
    model: 'seir',
    population: 10_000,
    r0: 2,
    latentDays: 3,
    infectiousDays: 5,
    initialInfected: 5,
    vaccinationCoverage: 0.3,
    vaccineEffectiveness: 0.9,
    interventionStartDay: 30,
    interventionEffect: 0.4,
    days: 120,
    stepsPerDay: 20,
    startDate: '2026-10-01T00:00:00Z',
  } satisfies z.input<typeof compartmentParams>,
  fields: {
    model: {
      label: 'Model',
      help: 'sir, or seir to add a latent period before people become infectious.',
    },
    population: { label: 'Population', help: 'People in the population, 10 to 10,000,000.' },
    r0: {
      label: 'Basic reproduction number (R0)',
      help: 'Average people one case infects in a fully susceptible population, 0.1 to 20.',
    },
    latentDays: {
      label: 'Latent period (days)',
      help: 'Mean days from infection to becoming infectious (SEIR only).',
    },
    infectiousDays: {
      label: 'Infectious period (days)',
      help: 'Mean days a case stays infectious.',
    },
    initialInfected: {
      label: 'Initial infected',
      help: 'People infected on day 1; no more than the population.',
    },
    vaccinationCoverage: {
      label: 'Vaccination coverage',
      help: 'Share of the population vaccinated before the outbreak, 0 to 1.',
    },
    vaccineEffectiveness: {
      label: 'Vaccine effectiveness',
      help: 'Share of vaccinated people protected, 0 to 1.',
    },
    interventionStartDay: {
      label: 'Intervention starts (day)',
      help: 'Day the intervention begins; leave empty for none.',
    },
    interventionEffect: {
      label: 'Intervention effect',
      help: 'Share by which transmission falls once the intervention starts, 0 to 1.',
    },
    days: { label: 'Days', help: 'Length of the run, 1 to 730 days.' },
    stepsPerDay: {
      label: 'Steps per day',
      help: 'Solver steps per day, 1 to 200; the default suits most runs.',
    },
    stochasticSeed: {
      label: 'Random seed (chance variant)',
      help: 'Set a whole number to run the chain-binomial chance variant with this seed; leave empty for the smooth deterministic curve.',
    },
    startDate: {
      label: 'Day 1 (UTC)',
      help: 'The first day of the series, as an ISO date and time.',
    },
  },
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
  description:
    'A common-source outbreak at one event: the foods served, one true vehicle and a distractor or two, and the fictional attendees who ate and fell ill. It writes the case events for scoring, a line list of fictional people and the attack-rate table by food.',
  toolkits: ['epidemiology', 'outbreak_at_sea'],
  example: {
    seed: 1,
    attendees: 120,
    eventStart: '2026-10-17T18:00:00Z',
    eventHours: 5,
    pathogenId: 'norovirus',
    foods: [
      { name: 'chicken salad', servedFraction: 0.7, trailsVehicle: 0 },
      { name: 'wedding cake', servedFraction: 0.85, trailsVehicle: 0.5 },
      { name: 'green salad', servedFraction: 0.6, trailsVehicle: 0 },
      { name: 'fruit punch', servedFraction: 0.75, trailsVehicle: 0.4 },
    ],
    vehicle: 'chicken salad',
    attackRateIfAte: 0.55,
    baselineAttackRate: 0.03,
    incubationSigma: 0.35,
    reportDelayMedianHours: 30,
    labConfirmedFraction: 0.25,
  } satisfies z.input<typeof commonSourceParams>,
  fields: {
    seed: {
      label: 'Random seed',
      help: 'Any whole number; the same seed gives the same attendees.',
    },
    attendees: { label: 'Attendees', help: 'People at the event, 10 to 5,000.' },
    eventStart: { label: 'Event start (UTC)', help: 'As an ISO date and time.' },
    eventHours: {
      label: 'Event length (hours)',
      help: 'Exposure happens at a random time within it, 0.5 to 72 hours.',
    },
    pathogenId: {
      label: 'Pathogen',
      help: 'norovirus, salmonella, measles, influenza, sars_cov_2, pertussis or legionella; sets the incubation range.',
    },
    foods: {
      label: 'Foods served',
      help: 'JSON list of { name, servedFraction (share who ate it, 0 to 1), trailsVehicle (0 to 1, how much more often vehicle eaters also ate it) }, 2 to 20 foods.',
    },
    vehicle: {
      label: 'True vehicle',
      help: 'The food that carries the pathogen; must be one of the foods.',
    },
    attackRateIfAte: {
      label: 'Attack rate if ate the vehicle',
      help: 'Share of attendees who ate the vehicle food and fell ill, 0 to 1.',
    },
    baselineAttackRate: {
      label: 'Background attack rate',
      help: 'Share of the others who fell ill anyway, 0 to 1.',
    },
    incubationSigma: {
      label: 'Incubation spread',
      help: 'Lognormal sigma of the incubation period, 0.01 to 1.5; larger spreads onsets out.',
    },
    reportDelayMedianHours: {
      label: 'Median report delay (hours)',
      help: 'Hours from onset to the case being reported.',
    },
    labConfirmedFraction: {
      label: 'Lab-confirmed share',
      help: 'Share of cases confirmed by a laboratory, 0 to 1.',
    },
  },
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
  description:
    'The settings an index case passed through, the people exposed in each, who counts as a close contact and when each can be reached, some never. It writes contact listing events for scoring and a contact roster of fictional people with their monitoring windows.',
  toolkits: ['epidemiology'],
  example: {
    seed: 1,
    pathogenId: 'measles',
    onset: '2026-10-19T00:00:00Z',
    closeContactMinutes: 15,
    unreachableFraction: 0.12,
    maxReachDay: 5,
    secondaryAttackRate: 0.1,
    notificationAt: '2026-10-21T15:00:00Z',
    settings: [
      {
        kind: 'clinic',
        name: 'Riverbend Urgent Care waiting room',
        people: 18,
        from: '2026-10-16T14:00:00Z',
        to: '2026-10-16T16:30:00Z',
        meanOverlapMinutes: 40,
      },
      {
        kind: 'school',
        name: 'Cedar Heights Elementary, room 12',
        people: 26,
        from: '2026-10-17T13:30:00Z',
        to: '2026-10-17T20:30:00Z',
        meanOverlapMinutes: 300,
      },
      {
        kind: 'household',
        name: 'Index household',
        people: 4,
        from: '2026-10-15T00:00:00Z',
        to: '2026-10-21T00:00:00Z',
        meanOverlapMinutes: 1200,
      },
    ],
  } satisfies z.input<typeof contactParams>,
  fields: {
    seed: {
      label: 'Random seed',
      help: 'Any whole number; the same seed gives the same contacts.',
    },
    pathogenId: {
      label: 'Pathogen',
      help: 'norovirus, salmonella, measles, influenza, sars_cov_2, pertussis or legionella; sets the infectious and monitoring windows.',
    },
    onset: {
      label: 'Index case onset (UTC)',
      help: 'Symptom (rash) onset of the index case, as an ISO date and time.',
    },
    closeContactMinutes: {
      label: 'Close contact after (minutes)',
      help: 'Overlap with the infectious period that makes a close contact, 0 to 1,440.',
    },
    unreachableFraction: {
      label: 'Unreachable share',
      help: 'Share of contacts never reached, 0 to 1.',
    },
    maxReachDay: {
      label: 'Reached within (days)',
      help: 'Latest day after the notification a reachable contact is reached, 1 to 30.',
    },
    secondaryAttackRate: {
      label: 'Secondary attack rate',
      help: 'Chance a close contact becomes a case, 0 to 1.',
    },
    notificationAt: {
      label: 'Health department notified (UTC)',
      help: 'As an ISO date and time; contact tracing starts here.',
    },
    settings: {
      label: 'Settings visited',
      help: 'JSON list of { kind (household, workplace, school, flight, unit or clinic), name, people, from, to (ISO times the case was there), meanOverlapMinutes }.',
    },
  },
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
  description:
    'A wastewater concentration that follows a daily case curve after a shedding lag, with noise, and the level band each day falls in. It writes the daily concentration on a simulated scale, not a public data scale.',
  toolkits: ['epidemiology'],
  example: {
    seed: 1,
    incidence: [2, 4, 7, 12, 18, 25, 31],
    lagDays: 3,
    baseline: 10,
    scale: 1,
    noiseSigma: 0.15,
    levels: [
      { name: 'low', multiple: 0 },
      { name: 'moderate', multiple: 1.5 },
      { name: 'high', multiple: 3 },
    ],
    startDate: '2026-10-01T00:00:00Z',
  } satisfies z.input<typeof wastewaterParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same noise.' },
    incidence: {
      label: 'Daily cases',
      help: 'JSON list of new cases per day the signal follows, at least 2 days.',
    },
    lagDays: {
      label: 'Shedding lag (days)',
      help: 'Mean days from infection to the signal, 0 to 21.',
    },
    baseline: {
      label: 'Baseline concentration',
      help: 'Concentration with no cases, in relative units.',
    },
    scale: {
      label: 'Concentration per case',
      help: 'Added concentration per daily case, in relative units.',
    },
    noiseSigma: { label: 'Noise', help: 'Lognormal sigma of the day-to-day noise, 0 to 1.' },
    levels: {
      label: 'Level bands',
      help: 'JSON list of { name, multiple }: a day is at the highest band whose multiple of the baseline it reaches (2 to 8 bands).',
    },
    startDate: {
      label: 'Day 1 (UTC)',
      help: 'The first day of the series, as an ISO date and time.',
    },
  },
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
  description:
    'A point of dispensing for medical countermeasures: people arriving (constant or front-loaded), stations serving them and the queue that builds. It writes the activation event for scoring and the arrivals, served and queue per interval.',
  toolkits: ['epidemiology', 'pharmacy'],
  example: {
    seed: 1,
    hoursOpen: 8,
    stations: 10,
    serviceMinutes: 6,
    arrivalsPerHour: 240,
    pattern: 'front_loaded',
    halfLifeHours: 3,
    intervalMinutes: 15,
    openDelayMinutes: 90,
    openAt: '2026-10-22T14:00:00Z',
    site: 'POD 1',
  } satisfies z.input<typeof dispensingParams>,
  fields: {
    seed: {
      label: 'Random seed',
      help: 'Any whole number; the same seed gives the same arrivals.',
    },
    hoursOpen: { label: 'Hours open', help: '1 to 24 hours.' },
    stations: { label: 'Dispensing stations', help: 'Stations serving at once, 1 to 200.' },
    serviceMinutes: {
      label: 'Service time (minutes)',
      help: 'Mean minutes to serve one person, 0.5 to 60.',
    },
    arrivalsPerHour: {
      label: 'Arrivals per hour at opening',
      help: 'People arriving each hour when the site opens, 0 to 5,000.',
    },
    pattern: {
      label: 'Arrival pattern',
      help: 'constant, or front_loaded (a rush at opening that tails off).',
    },
    halfLifeHours: {
      label: 'Rush half-life (hours)',
      help: 'Front-loaded only: the arrival rate halves every this many hours.',
    },
    intervalMinutes: {
      label: 'Report every (minutes)',
      help: 'Length of each interval in the flow series, 5 to 60.',
    },
    openDelayMinutes: {
      label: 'Opening delay (minutes)',
      help: 'Minutes from the decision to open until the first person is served, 0 to 600.',
    },
    openAt: { label: 'Opening decision (UTC)', help: 'As an ISO date and time.' },
    site: { label: 'Site name', help: 'A short name such as POD 1.' },
  },
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
