// Simulated case-data generators of the EMS, fire and hazmat toolkits (spec 0456 FR-9). Importing
// this module registers them. The framework labels everything they produce as simulated.
import { registerGenerator, type GeneratedDataset } from '../../case-data/generators'
import { CallLoadParams, generateCallLoad } from './call-load'
import { CasualtyParams, generateCasualties, type SimPatient } from './casualties'
import { ReleaseParams, exposures, windSegments, zoneFeatures } from './release'

const range = (times: string[]): { start: string; end: string } => {
  const sorted = [...times].sort()
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! }
}

const patientLine = (x: SimPatient): string =>
  `${x.ageYears} ${x.sex}. ${x.injuries}. ${Math.round(x.findings.respirationsPerMinute)} breaths a minute, ` +
  `refill ${x.findings.capillaryRefillSeconds} s, ${x.findings.obeysCommands ? 'obeys commands' : 'does not obey commands'}. ` +
  `${x.priority}. Best destination: ${x.bestDestination}.`

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
  generate: casualtyDatasets,
})
registerGenerator({
  id: 'hazmat-release',
  label: 'Simulated hazmat release',
  params: ReleaseParams,
  generate: releaseDatasets,
})
registerGenerator({
  id: 'dispatch-call-load',
  label: 'Simulated dispatch call load',
  params: CallLoadParams,
  generate: callLoadDatasets,
})
