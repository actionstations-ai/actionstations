// The space weather generator (spec 0468 FR-8, FR-9), registered with the case-data framework,
// which labels everything it makes as simulated. It writes the series the figures draw (X-ray,
// proton, solar wind, Kp, magnetometer, neutral current, GNSS), the ground-truth events and
// SWPC messages, and the modeled series the toolkit's timing metrics read.
import type { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { holdoverZones } from './gnss'
import {
  SpaceEventParams,
  simulateEvent,
  firstKpAtLeast,
  type SimulatedEvent,
  type TimedValue,
} from './simulate'

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const series = (id: string, label: string, data: TimedValue[], unit: string): GeneratedDataset => ({
  id,
  kind: 'series',
  label: `${label}, simulated`,
  data,
  unit,
  range: { start: data[0]!.t, end: data.at(-1)!.t },
})

/**
 * A dataset a metric reads is a GeoJSON collection with no features and the rows under
 * `series` or `events`, the form the metric input adapters read (see the flooding generators).
 */
const metricFile = (key: 'series' | 'events', rows: unknown[]) => ({
  type: 'FeatureCollection',
  features: [],
  [key]: rows,
})

export interface EventRow {
  id: string
  time: string
  kind: string
  attrs: Record<string, unknown>
}

export function eventRows(p: SpaceEventParams, e: SimulatedEvent): EventRow[] {
  const rows: EventRow[] = [
    {
      id: 'flare',
      time: new Date(e.clock.flare).toISOString(),
      kind: 'flare',
      attrs: { flareClass: p.flareClass },
    },
    {
      id: 'shock-arrival',
      time: new Date(e.clock.arrival).toISOString(),
      kind: 'storm_onset',
      attrs: { cmeSpeedKmS: p.cmeSpeedKmS },
    },
  ]
  const met = firstKpAtLeast(e.kp, p.conditionKp)
  if (met)
    rows.push({
      id: 'kp-condition-met',
      time: met,
      kind: 'kp_condition_met',
      attrs: { conditionKp: p.conditionKp },
    })
  e.messages.forEach((m, i) =>
    rows.push({
      id: `swpc-${i + 1}-${m.code}`,
      time: m.time,
      kind: 'swpc_message',
      attrs: { code: m.code, productKind: m.kind, headline: m.headline },
    }),
  )
  return rows.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

function zoneDatasets(p: SpaceEventParams, e: SimulatedEvent): GeneratedDataset[] {
  const out: GeneratedDataset[] = [
    {
      id: 'zones-procedure',
      kind: 'features',
      label: `Kp above the operating procedure condition of ${p.conditionKp}, simulated`,
      data: metricFile('series', [
        {
          zone: 'GMD operating procedure condition',
          quantity: `Kp above the procedure condition (Kp ${p.conditionKp})`,
          points: e.kp.map((x) => ({
            time: x.t,
            value: Math.round((x.v - p.conditionKp) * 100) / 100,
          })),
        },
      ]),
    },
  ]
  const holdover = holdoverZones(e.gnss)
  if (holdover.length)
    out.push({
      id: 'zones-holdover',
      kind: 'features',
      label: 'Hours of GNSS loss beyond each site’s holdover, simulated',
      data: metricFile('series', holdover),
    })
  if (p.peakS > 0)
    out.push({
      id: 'zones-safe-mode',
      kind: 'features',
      label: 'Proton flux above the safe-mode threshold, simulated',
      data: metricFile('series', [
        {
          zone: 'Safe-mode flux threshold',
          quantity: 'pfu above the safe-mode threshold (100 pfu)',
          points: e.proton.map((x) => ({ time: x.t, value: Math.round((x.v - 100) * 100) / 100 })),
        },
      ]),
    })
  return out
}

export const spaceWeatherEventGenerator: SimulatedGenerator<SpaceEventParams> = {
  id: 'space-weather-event',
  label: 'Simulated space weather event (flare, radiation, CME, Kp, GIC, GNSS)',
  params: SpaceEventParams as z.ZodType<SpaceEventParams>,
  description:
    'A flare, a radiation storm and a CME whose arrival drives a geomagnetic storm of the G level you set. Writes X-ray, proton, solar wind, Kp, magnetometer, transformer neutral current and GNSS series, the SWPC watches, warnings and alerts in order, and the series the timing measures read.',
  toolkits: ['space_weather'],
  example: {
    flareTime: '2026-11-05T09:00:00Z',
    flareClass: 'X2.1',
    peakS: 3,
    peakG: 4,
    cmeSpeedKmS: 1500,
    arrivalUncertaintyHours: 6,
    stormDurationHours: 24,
    conditionKp: 7,
    groundConductivityFactor: 1,
    site: 'Harbor 345 kV T2',
    receivers: [
      {
        name: 'Harbor central office',
        class: 'disciplined_oscillator',
        holdoverHours: 8,
        errorLimitM: 5,
      },
      { name: 'Pine Ridge tower', class: 'multi_frequency', errorLimitM: 5 },
    ],
    scintillationHours: 48,
  } satisfies z.input<typeof SpaceEventParams>,
  fields: {
    flareTime: {
      label: 'Flare time (UTC)',
      help: 'The eruption; every other time follows from it.',
    },
    flareClass: { label: 'Flare class', help: 'Peak GOES X-ray class, such as M5 or X2.1.' },
    peakS: { label: 'Peak S level', help: 'Radiation storm level, 0 (none) to 5.' },
    peakG: { label: 'Peak G level', help: 'Geomagnetic storm level, 0 (none) to 5.' },
    cmeSpeedKmS: {
      label: 'CME speed (km/s)',
      help: '300 to 3500; the transit time to Earth follows from it.',
    },
    arrivalUncertaintyHours: {
      label: 'Arrival window (± hours)',
      help: 'The forecast arrival window is plus or minus this many hours, 1 to 24.',
    },
    stormDurationHours: {
      label: 'Storm decay (hours)',
      help: 'Hours from the peak back to quiet, 6 to 72.',
    },
    conditionKp: {
      label: 'Procedure Kp',
      help: "Kp at which the grid operating procedure's condition is met, 4 to 9.",
    },
    groundConductivityFactor: {
      label: 'Ground conductivity factor',
      help: 'Scales the neutral current; 1 is the reference, 0.1 to 5.',
    },
    site: {
      label: 'Monitored transformer',
      help: 'The transformer or substation whose neutral current is written.',
    },
    receivers: {
      label: 'GNSS receivers',
      help: 'Each item: name, class (single_frequency, multi_frequency or disciplined_oscillator), holdoverHours (required for a disciplined oscillator) and errorLimitM, the horizontal error in meters above which GNSS is not usable.',
    },
    scintillationHours: {
      label: 'Disturbed ionosphere (hours)',
      help: 'Hours the ionosphere stays disturbed after the Kp peak; leave empty for a default from the G level.',
    },
  },
  generate(p) {
    const e = simulateEvent(p)
    const out: GeneratedDataset[] = [
      series('xray-flux', 'GOES X-ray flux', e.xray, 'W/m2'),
      series('proton-flux', 'GOES proton flux at 10 MeV and above', e.proton, 'pfu'),
      series('solar-wind', 'Solar wind speed at the upstream monitor', e.wind, 'km/s'),
      series('kp', 'Planetary Kp by three-hour interval', e.kp, 'Kp'),
      series('magnetometer-h', 'Ground magnetometer H deviation', e.magnetometer, 'nT'),
      series('gic-neutral', `Neutral current at ${p.site}`, e.gic, 'A'),
    ]
    for (const g of e.gnss) {
      const id = slug(g.receiver.name)
      out.push(series(`gnss-${id}-error`, `${g.receiver.name} horizontal error`, g.error, 'm'))
      out.push(
        series(
          `gnss-${id}-satellites`,
          `${g.receiver.name} satellites tracked`,
          g.satellites,
          'satellites',
        ),
      )
      if (g.holdover.length)
        out.push(
          series(`gnss-${id}-holdover`, `${g.receiver.name} holdover remaining`, g.holdover, 'h'),
        )
    }
    out.push({
      id: 'space-events',
      kind: 'features',
      label: 'Space weather events and SWPC messages in order, simulated',
      data: metricFile('events', eventRows(p, e)),
    })
    out.push(...zoneDatasets(p, e))
    return out
  },
}
