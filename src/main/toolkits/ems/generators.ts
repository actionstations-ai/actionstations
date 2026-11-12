// Simulated case-data generators of the EMS, fire and hazmat toolkits (spec 0456 FR-9). Importing
// this module registers them. The framework labels everything they produce as simulated.
import type { z } from 'zod'
import { registerGenerator, type GeneratedDataset } from '../../case-data/generators'
import { CallLoadParams, generateCallLoad } from './call-load'
import {
  CasualtyParams,
  generateCasualties,
  type CasualtyResult,
  type SimPatient,
} from './casualties'
import { ReleaseParams, exposures, windSegments, zoneFeatures } from './release'

const range = (times: string[]): { start: string; end: string } => {
  const sorted = [...times].sort()
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! }
}

const patientLine = (x: SimPatient): string =>
  `${x.ageYears} ${x.sex}. ${x.injuries}. ${Math.round(x.findings.respirationsPerMinute)} breaths a minute, ` +
  `refill ${x.findings.capillaryRefillSeconds} s, ${x.findings.obeysCommands ? 'obeys commands' : 'does not obey commands'}. ` +
  `${x.priority}. Best destination: ${x.bestDestination}.`

interface TruthEvent {
  id: string
  time: string
  kind: string
  attrs: Record<string, unknown>
}

/**
 * Ground-truth events for the metrics, in a file the dataset reader accepts: an `events` list
 * beside an empty GeoJSON collection, so map overlays draw nothing from it.
 */
const groundTruth = (events: TruthEvent[]) => ({ type: 'FeatureCollection', features: [], events })

function mciEvents(p: CasualtyParams, r: CasualtyResult): TruthEvent[] {
  const first = new Date(Date.parse(p.startTime) + p.firstUnitMinutes * 60_000).toISOString()
  return [
    { id: 'first-unit', time: first, kind: 'first_unit_on_scene', attrs: {} },
    { id: 'triage-complete', time: r.triageCompleteAt, kind: 'triage_complete', attrs: {} },
    ...r.patients.map((x) => ({
      id: x.id,
      time: x.triagedAt,
      kind: 'patient',
      attrs: {
        tag: x.id,
        priority: x.priority,
        appropriate: x.appropriateHospitals,
        best: x.bestDestination,
        shortfall: x.capacityShortfall,
      },
    })),
    ...p.hospitals.map((h) => ({
      id: h.name,
      time: p.startTime,
      kind: 'hospital',
      attrs: { name: h.name, limit: h.receiveLimit },
    })),
  ]
}

function releaseEvents(p: ReleaseParams, at: (m: number) => string): TruthEvent[] {
  return [
    {
      id: 'zone',
      time: at(0),
      kind: 'release_zone',
      attrs: {
        isolationDistance: p.isolationDistance,
        protectiveDistance: p.protectiveDistance,
        unit: p.unit,
        distanceSource:
          p.distanceSource === 'fictional' ? 'invented exercise values' : `guidebook ${p.edition}`,
      },
    },
    ...exposures(p).flatMap((e) =>
      e.arrivesAtMinutes === null
        ? []
        : [
            {
              id: `${e.place}-${e.segment}`,
              time: at(e.arrivesAtMinutes),
              kind: 'plume_arrival',
              attrs: { place: e.place, zone: e.zone },
            },
          ],
    ),
  ]
}

function casualtyDatasets(raw: unknown): GeneratedDataset[] {
  const p = CasualtyParams.parse(raw)
  const r = generateCasualties(p)
  const events = r.patients.flatMap((x) => [
    { t: x.triagedAt, title: `${x.id} triaged ${x.priority}`, text: patientLine(x) },
    {
      t: x.transportAt,
      title: `${x.id} leaves with ${x.transportUnit}`,
      text: `${x.priority} patient ${x.id} leaves for ${x.bestDestination}.`,
    },
  ])
  const received: Record<string, number> = {}
  const load = [...r.patients]
    .sort((a, b) => a.transportAt.localeCompare(b.transportAt))
    .map((x) => {
      received[x.bestDestination] = (received[x.bestDestination] ?? 0) + 1
      return { t: x.transportAt, v: { ...received } }
    })
  const r2 = range(events.map((e) => e.t))
  return [
    {
      id: 'mci-triage-counts',
      label: `Patients tagged by priority, ${p.incident}`,
      kind: 'series',
      unit: 'patients',
      range: r2,
      data: r.counts.map((c) => ({
        t: c.t,
        v: {
          immediate: c.immediate,
          delayed: c.delayed,
          minor: c.minor,
          expectant: c.expectant,
          deceased: c.deceased,
        },
      })),
    },
    {
      id: 'mci-timeline',
      label: `Triage and transport timeline, ${p.incident}`,
      kind: 'text',
      range: r2,
      data: events.sort((a, b) => a.t.localeCompare(b.t)),
    },
    {
      id: 'mci-hospital-load',
      label: `Patients sent to each hospital, ${p.incident}`,
      kind: 'series',
      unit: 'patients',
      range: r2,
      data: load,
    },
    {
      id: 'mci-ground-truth',
      label: `Ground truth for scoring, ${p.incident}`,
      kind: 'features',
      range: r2,
      data: groundTruth(mciEvents(p, r)),
    },
  ]
}

function releaseDatasets(raw: unknown): GeneratedDataset[] {
  const p = ReleaseParams.parse(raw)
  const t0 = Date.parse(p.startTime)
  const at = (m: number): string => new Date(t0 + m * 60_000).toISOString()
  const segs = windSegments(p)
  const arrivals = exposures(p).map((e) => ({
    t: at(e.arrivesAtMinutes ?? 0),
    title: `${e.place}: ${e.zone === 'isolation' ? 'inside the isolation zone' : 'inside the protective action zone'}`,
    text:
      e.arrivesAtMinutes === null
        ? `${e.place} is inside a zone but the wind is too light to carry the plume front there.`
        : `The plume front would reach ${e.place} about ${e.arrivesAtMinutes} minutes after the release (distance divided by wind speed; not a dispersion model).`,
  }))
  return [
    {
      id: 'release-zones',
      label: `Isolation and protective action zones, ${p.incident}`,
      kind: 'features',
      range: { start: at(0), end: at(p.durationMinutes) },
      data: zoneFeatures(p),
    },
    {
      id: 'release-wind',
      label: `Wind at the scene, ${p.incident}`,
      kind: 'series',
      unit: p.wind.unit,
      range: { start: at(0), end: at(p.durationMinutes) },
      data: segs.map((s) => ({ t: at(s.startMinutes), v: { fromDeg: s.fromDeg, speed: s.speed } })),
    },
    {
      id: 'release-exposure',
      label: `Plume arrival at places, ${p.incident}`,
      kind: 'text',
      range: { start: at(0), end: at(p.durationMinutes) },
      data: arrivals.length
        ? arrivals.sort((a, b) => a.t.localeCompare(b.t))
        : [{ t: at(0), title: 'No place in a zone', text: 'No listed place is inside a zone.' }],
    },
    {
      id: 'release-ground-truth',
      label: `Ground truth for scoring, ${p.incident}`,
      kind: 'features',
      range: { start: at(0), end: at(p.durationMinutes) },
      data: groundTruth(releaseEvents(p, at)),
    },
  ]
}

function callLoadDatasets(raw: unknown): GeneratedDataset[] {
  const p = CallLoadParams.parse(raw)
  const r = generateCallLoad(p)
  const end = r.perMinute[r.perMinute.length - 1]!.t
  return [
    {
      id: 'dispatch-calls-per-minute',
      label: 'Calls received per minute',
      kind: 'series',
      unit: 'calls',
      range: { start: p.startTime, end },
      data: r.perMinute.map((m) => ({ t: m.t, v: m.calls })),
    },
    {
      id: 'dispatch-calls',
      label: 'Calls received',
      kind: 'text',
      range: { start: p.startTime, end },
      data: r.calls.map((c) => ({
        t: c.t,
        title: `${c.priority} ${c.type}`,
        text: `${c.type} at ${c.address}. Priority ${c.priority}.`,
      })),
    },
  ]
}

registerGenerator({
  id: 'mci-casualties',
  label: 'Simulated mass casualty incident',
  params: CasualtyParams,
  description:
    'Fictional patients from a mass casualty incident in the priority mix you set, triaged by START or SALT as the first units arrive, then carried by the ambulances you list to the hospitals that can take them. It writes the triage counts over time, the triage and transport timeline, the patients sent to each hospital and the ground truth the triage and transport measures score against.',
  toolkits: ['mci_triage', 'dispatch'],
  example: {
    incident: 'Route 9 school bus collision',
    startTime: '2026-10-21T10:11:00Z',
    method: 'START',
    mix: { immediate: 4, delayed: 9, minor: 12, expectant: 3 },
    childShare: 0.4,
    seed: 1,
    firstUnitMinutes: 8,
    secondsPerPatient: 40,
    hospitals: [
      {
        name: 'Alder Creek Regional Medical Center',
        trauma: true,
        burn: true,
        pediatric: false,
        receiveLimit: 10,
        driveMinutes: 18,
      },
      {
        name: 'Juniper Childrens Hospital',
        trauma: true,
        burn: false,
        pediatric: true,
        receiveLimit: 6,
        driveMinutes: 25,
      },
      {
        name: 'Fenwick Community Hospital',
        trauma: false,
        burn: false,
        pediatric: false,
        receiveLimit: 30,
        driveMinutes: 8,
      },
    ],
    ambulances: [
      { unit: 'Medic 4', arriveMinutes: 8 },
      { unit: 'Medic 9', arriveMinutes: 12 },
      { unit: 'Medic 12', arriveMinutes: 18 },
      { unit: 'Medic 15', arriveMinutes: 25 },
    ],
  } satisfies z.input<typeof CasualtyParams>,
  fields: {
    incident: { label: 'Incident name', help: 'A short name used in every dataset label.' },
    startTime: {
      label: 'Call received (UTC)',
      help: 'When the call came in, as an ISO date and time.',
    },
    method: { label: 'Triage method', help: 'START (JumpSTART for children) or SALT.' },
    mix: {
      label: 'Patients by priority',
      help: 'JSON object with the number of immediate, delayed, minor and expectant patients; at least one in total.',
    },
    childShare: { label: 'Share of children', help: 'Share of patients who are children, 0 to 1.' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number; the same seed gives the same patients.',
    },
    firstUnitMinutes: {
      label: 'First unit on scene (minutes)',
      help: 'Minutes from the call to the first unit, 1 to 60.',
    },
    secondsPerPatient: { label: 'Triage time per patient (seconds)', help: '10 to 300 seconds.' },
    hospitals: {
      label: 'Hospitals',
      help: 'JSON list of { name, trauma, burn, pediatric (true or false), receiveLimit (patients it can take), driveMinutes }.',
    },
    ambulances: {
      label: 'Ambulances',
      help: 'JSON list of { unit, arriveMinutes } giving each unit and when it arrives after the call.',
    },
  },
  generate: casualtyDatasets,
})
registerGenerator({
  id: 'hazmat-release',
  label: 'Simulated hazmat release',
  params: ReleaseParams,
  description:
    'A release of a material from a container, with the isolation zone and the downwind protective action zone for each stretch of wind, and when the wind would carry the plume front to each listed place. It writes the zones as map features, the wind series, the arrival at places and the ground truth for scoring; arrival is distance divided by wind speed, not a dispersion model.',
  toolkits: ['hazmat', 'spill_plume'],
  example: {
    incident: 'Tank car at Harlan Spur',
    material: 'Exercise material X-17 (fictional)',
    container: 'Rail tank car',
    amount: '20,000 gallons',
    distanceSource: 'fictional',
    edition: '',
    isolationDistance: 300,
    protectiveDistance: 1500,
    unit: 'ft',
    lat: 41.5,
    lon: -81.7,
    startTime: '2026-10-21T11:00:00Z',
    durationMinutes: 120,
    wind: { fromDeg: 270, speed: 8, unit: 'mph' },
    shifts: [{ atMinutes: 20, fromDeg: 225 }],
    places: [
      { name: 'Elm Street school', bearingDeg: 90, distance: 1400 },
      { name: 'Mill Street clinic', bearingDeg: 20, distance: 1200 },
    ],
  } satisfies z.input<typeof ReleaseParams>,
  fields: {
    incident: { label: 'Incident name', help: 'A short name used in every dataset label.' },
    material: {
      label: 'Material',
      help: 'The material released; a fictional name when the distances are invented.',
    },
    container: { label: 'Container', help: 'For example rail tank car, cargo tank or drum.' },
    amount: { label: 'Amount', help: 'Free text with a unit, for example 20,000 gallons.' },
    distanceSource: {
      label: 'Distances from',
      help: 'entered (copied from a guidebook, give the edition) or fictional (invented exercise values).',
    },
    edition: {
      label: 'Guidebook edition',
      help: 'Required when the distances are entered from a guidebook.',
    },
    isolationDistance: {
      label: 'Isolation distance',
      help: 'Radius of the isolation zone, in the unit below.',
    },
    protectiveDistance: {
      label: 'Protective action distance',
      help: 'Downwind length of the protective action zone, in the unit below.',
    },
    unit: {
      label: 'Distance unit',
      help: 'ft, m, mi or km; also the unit of the place distances.',
    },
    lat: { label: 'Latitude', help: 'Release point, decimal degrees.' },
    lon: { label: 'Longitude', help: 'Release point, decimal degrees (west is negative).' },
    startTime: { label: 'Release time (UTC)', help: 'As an ISO date and time.' },
    durationMinutes: { label: 'Duration (minutes)', help: '10 to 1,440 minutes.' },
    wind: {
      label: 'Wind',
      help: 'JSON object: fromDeg (direction the wind blows from, 0 to 360), speed, unit (mph, kt, m/s or km/h).',
    },
    shifts: {
      label: 'Wind shifts',
      help: 'JSON list of { atMinutes, fromDeg, speed (optional) }: from that minute the wind is as given (up to 6).',
    },
    places: {
      label: 'Places to check',
      help: 'JSON list of { name, bearingDeg (from the release point), distance (in the distance unit) }, up to 12.',
    },
  },
  generate: releaseDatasets,
})
registerGenerator({
  id: 'dispatch-call-load',
  label: 'Simulated dispatch call load',
  params: CallLoadParams,
  description:
    'Calls arriving at a dispatch center minute by minute from a mix of call types and priorities, with an optional surge. It writes the calls per minute and the list of calls with invented addresses.',
  toolkits: ['dispatch'],
  example: {
    startTime: '2026-10-21T10:00:00Z',
    minutes: 120,
    baselinePerMinute: 0.4,
    surge: { atMinute: 20, lengthMinutes: 30, multiplier: 4 },
    mix: [
      { type: 'Chest pain', priority: 'P1', share: 8 },
      { type: 'Fall, injury', priority: 'P2', share: 22 },
      { type: 'Sick person', priority: 'P3', share: 24 },
      { type: 'Motor vehicle collision', priority: 'P2', share: 10 },
    ],
    seed: 1,
  } satisfies z.input<typeof CallLoadParams>,
  fields: {
    startTime: { label: 'Start (UTC)', help: 'The first minute, as an ISO date and time.' },
    minutes: { label: 'Length (minutes)', help: '5 to 480 minutes.' },
    baselinePerMinute: {
      label: 'Normal calls per minute',
      help: 'Average calls a minute outside the surge, 0.05 to 10.',
    },
    surge: {
      label: 'Surge',
      help: 'Optional JSON object: atMinute (when it starts), lengthMinutes and multiplier (1 to 20 times the normal rate).',
    },
    mix: {
      label: 'Call mix',
      help: 'JSON list of { type, priority (such as P1), share (relative weight) }.',
    },
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same calls.' },
  },
  generate: callLoadDatasets,
})
