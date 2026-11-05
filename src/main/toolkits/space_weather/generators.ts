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
