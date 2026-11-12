// The flooding generators (spec 0454 FR-11), registered with the case-data framework, which
// labels everything they make as simulated. Each turns validated parameters into datasets: gauge
// records, stage series, forecasts per issuance, an extent per time step with exposure counts,
// and for a flash flood the rain, the basin response and the warning polygon.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import type { CategoryTableSchema } from '../../render/figures/flood/common'
import { categoryOf } from '../../render/figures/flood/common'
import { zoneSeries, type FloodZone } from './threshold-series'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import {
  FlashEventParams,
  RiverEventParams,
  exposureAt,
  extentSteps,
  flashSeries,
  forecastSeries,
  riverSeries,
  type SimGaugeParams,
  type SimPoint,
} from './simulate'

const closeRing = (ring: readonly [number, number][]): [number, number][] => {
  const first = ring[0]!
  const last = ring.at(-1)!
  return first[0] === last[0] && first[1] === last[1] ? [...ring] : [...ring, first]
}

const range = (pts: readonly SimPoint[]) =>
  pts.length ? { start: pts[0]!.t, end: pts.at(-1)!.t } : undefined

function gaugeDataset(
  g: { id: string; name: string; categories: z.infer<typeof CategoryTableSchema> },
  lonLat: [number, number],
): GeneratedDataset {
  const cats: Record<string, number> = {}
  for (const [k, v] of Object.entries(g.categories)) if (v !== undefined) cats[k] = v
  if (cats.flood === undefined && cats.minor !== undefined) cats.flood = cats.minor
  return {
    id: `gauge-${g.id}`,
    kind: 'features',
    label: `${g.name} (${g.id.toUpperCase()}): gauge record`,
    unit: 'ft',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: lonLat },
          properties: {
            kind: 'flood_gauge',
            lid: g.id.toUpperCase(),
            name: g.name,
            usgsId: null,
            timeZone: null,
            unit: 'ft',
            categories: cats,
            historicCrests: [],
            upstreamLid: null,
            downstreamLid: null,
            rating: [],
          },
        },
      ],
    },
  }
}

const gaugeLonLat = (g: SimGaugeParams, i: number): [number, number] =>
  g.lonLat ?? [r4(-90 + g.mile * 0.014), r4(38 - i * 0.01)]
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4

export const riverEventGenerator: SimulatedGenerator<z.infer<typeof RiverEventParams>> = {
  id: 'flood-river-event',
  label: 'Simulated river flood (rise and fall, forecasts, extent)',
  params: RiverEventParams,
  description:
    'A river flood that rises and falls at each gauge, travels downstream at the wave speed, and is forecast at each issuance (forecasts can change category), with a flood extent over the floodplain you draw and the assets it reaches. It writes gauge records, stage and forecast series, the extent with exposure counts, and the zone series the flood measures score actions against.',
  toolkits: ['flooding'],
  example: {
    river: 'Cedar River',
    start: '2026-11-05T12:00:00Z',
    stepMinutes: 60,
    durationHours: 120,
    crestAtHour: 60,
    recessionHours: 48,
    waveSpeedMph: 3,
    gauges: [
      {
        id: 'MLFM7',
        name: 'Cedar River at Milford',
        mile: 0,
        baseStage: 6,
        crestStage: 16,
        categories: { action: 12, flood: 14, minor: 14, moderate: 17, major: 21 },
        lonLat: [-90.1, 38],
      },
      {
        id: 'RBDM7',
        name: 'Cedar River at Riverbend',
        mile: 30,
        baseStage: 8,
        crestStage: 17.8,
        categories: { action: 12, flood: 14, minor: 14, moderate: 17, major: 21 },
        lonLat: [-89.7, 37.9],
      },
    ],
    issuances: [
      { atHour: 36, crestStage: 14.5, crestAtHour: 66 },
      { atHour: 54, crestStage: 16, crestAtHour: 60 },
    ],
    floodplain: [
      {
        stage: 14,
        ring: [
          [-90.1, 38],
          [-90.09, 38],
          [-90.09, 38.01],
          [-90.1, 38.01],
        ],
      },
      {
        stage: 15.5,
        ring: [
          [-90.1, 38],
          [-90.08, 38],
          [-90.08, 38.02],
          [-90.1, 38.02],
        ],
      },
    ],
    assets: [
      { id: 'a1', name: 'Mill Road crossing', kind: 'road', floodsAtStage: 14, count: 1 },
      { id: 'a2', name: 'Water plant', kind: 'facility', floodsAtStage: 17, count: 1 },
      { id: 'a3', name: 'East Bend homes', kind: 'population', floodsAtStage: 16, count: 340 },
    ],
    extentEveryHours: 6,
  } satisfies z.input<typeof RiverEventParams>,
  fields: {
    river: { label: 'River', help: 'River name used in the labels.' },
    start: { label: 'Start (UTC)', help: 'Hour 0 of the event, as an ISO date and time.' },
    stepMinutes: { label: 'Step (minutes)', help: 'Time between stage values, 15 to 360.' },
    durationHours: { label: 'Duration (hours)', help: '24 to 480 hours.' },
    crestAtHour: {
      label: 'Crest at first gauge (hour)',
      help: 'Hours from the start to the crest at the first gauge.',
    },
    recessionHours: {
      label: 'Recession (hours)',
      help: 'Hours the river takes to fall back after the crest.',
    },
    waveSpeedMph: {
      label: 'Wave speed (mph)',
      help: 'Speed of the flood wave between gauges, 0.5 to 15 miles per hour.',
    },
    gauges: {
      label: 'Gauges',
      help: 'JSON list from upstream to downstream (1 to 6) of { id (3 to 10 letters and digits), name, mile (downstream of the first), baseStage, crestStage (feet), categories ({ action, flood, minor, moderate, major } stages in feet), lonLat ([lon, lat], optional) }.',
    },
    issuances: {
      label: 'Forecast issuances',
      help: 'JSON list (up to 8) of { atHour (when issued), crestStage and crestAtHour (the forecast crest at the first gauge; both optional, the true crest when absent) }.',
    },
    floodplain: {
      label: 'Floodplain extents',
      help: 'JSON list of rising levels { stage (feet at the first gauge), ring (a polygon as [lon, lat] points) }, up to 12.',
    },
    assets: {
      label: 'Assets at risk',
      help: 'JSON list of { id, name, kind (structure, road, facility or population), floodsAtStage (feet at the first gauge), count (people for population, else 1) }.',
    },
    extentEveryHours: {
      label: 'Extent every (hours)',
      help: 'Hours between extent snapshots, 1 to 48.',
    },
  },
  generate(p) {
    const out: GeneratedDataset[] = []
    const truth = riverSeries(p)
    p.gauges.forEach((g, i) => {
      out.push(gaugeDataset(g, gaugeLonLat(g, i)))
      const s = truth.find((t) => t.gaugeId === g.id)!
      out.push({
        id: `stage-${g.id}`,
        kind: 'series',
        label: `${g.name} (${g.id.toUpperCase()}): stage, simulated`,
        data: s.points,
        unit: 'ft',
        ...(range(s.points) ? { range: range(s.points)! } : {}),
      })
    })
    for (const f of forecastSeries(p)) {
      const g = p.gauges.find((x) => x.id === f.gaugeId)!
      out.push({
        id: `forecast-${f.gaugeId}-${f.n}`,
        kind: 'series',
        label: `${g.name}: forecast ${f.n} issued ${f.issuedAt}, simulated`,
        data: f.points,
        unit: 'ft',
        ...(range(f.points) ? { range: range(f.points)! } : {}),
      })
    }
    const steps = extentSteps(p, truth[0])
    if (steps.length) {
      const exposure = steps.map((s) => ({ s, e: exposureAt(p.assets, s.stage) }))
      out.push({
        id: 'inundation-extent',
        kind: 'features',
        label: `Flood extent along ${p.river}, simulated illustration (not a hazard map)`,
        data: {
          type: 'FeatureCollection',
          features: exposure
            .filter(({ s }) => s.ring)
            .map(({ s, e }, i, all) => ({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [closeRing(s.ring!)] },
              properties: {
                kind: 'simulated_extent',
                start: s.t,
                end: all[i + 1]?.s.t ?? s.t,
                stage: s.stage,
                level: s.level,
                exposure: e,
              },
            })),
        },
      })
      out.push({
        id: 'exposure',
        kind: 'series',
        label: `Exposure by time at the reference gauge, simulated`,
        data: exposure.map(({ s, e }) => ({
          t: s.t,
          v: {
            structures: e.structure,
            roads: e.road,
            facilities: e.facility,
            population: e.population,
          },
        })),
        unit: 'count',
      })
    }
    out.push(...zoneDatasets(p, truth[0]!.points))
    return out
  },
}

/**
 * A dataset a metric reads (ModeledSeries per zone, or ground-truth events) is stored as a
 * GeoJSON collection with no features and the rows under `series` or `events`; the metric
 * input adapters read exactly that key and the case store accepts it as a features dataset.
 */
const metricFile = (key: 'series' | 'events', rows: unknown[]) => ({
  type: 'FeatureCollection',
  features: [],
  [key]: rows,
})

/** One zone-series dataset per action the toolkit scores, from the reference gauge's stage. */
function zoneDatasets(
  p: z.infer<typeof RiverEventParams>,
  stage: readonly { t: string; v: number }[],
): GeneratedDataset[] {
  const zone = (a: z.infer<typeof RiverEventParams>['assets'][number]): FloodZone => ({
    name: a.name,
    floodsAtStage: a.floodsAtStage,
  })
  const groups: [string, string, FloodZone[]][] = [
    ['zones-road', 'Roads and crossings', p.assets.filter((a) => a.kind === 'road').map(zone)],
    [
      'zones-population',
      'Areas to evacuate',
      p.assets.filter((a) => a.kind === 'population').map(zone),
    ],
    [
      'zones-facility',
      'Facilities and stock to move',
      p.assets.filter((a) => a.kind === 'facility' || a.kind === 'structure').map(zone),
    ],
  ]
  const action = p.gauges[0]!.categories.action
  if (action !== undefined)
    groups.push(['zones-action', 'Action stage', [{ name: 'Action stage', floodsAtStage: action }]])
  return groups
    .filter(([, , zones]) => zones.length)
    .map(([id, label, zones]) => ({
      id,
      kind: 'features' as const,
      label: `${label}: feet above the stage that floods each, simulated`,
      data: metricFile('series', zoneSeries(stage, zones)),
    }))
}

export const flashEventGenerator: SimulatedGenerator<z.infer<typeof FlashEventParams>> = {
  id: 'flood-flash-event',
  label: 'Simulated flash flood (rain, small-basin response, warning polygon)',
  params: FlashEventParams,
  description:
    'A flash flood in a small basin: a burst of rain, the stream gauge responding within the hour, and an optional flash flood warning polygon with its damage tag. It writes the gauge record, rainfall and stage series, the first flooding report for scoring and the warning polygon.',
  toolkits: ['flooding', 'weather'],
  example: {
    basin: 'Cedar Creek basin',
    gauge: {
      id: 'CCRM7',
      name: 'Cedar Creek at the camp road',
      baseStage: 1.2,
      peakStage: 11.4,
      categories: { action: 5, minor: 8, moderate: 10, major: 13 },
      lonLat: [-90.17, 38.12],
    },
    start: '2026-11-05T00:00:00Z',
    stepMinutes: 15,
    durationHours: 12,
    rainPeakHour: 3,
    rainDurationHours: 3,
    rainTotalInches: 4.5,
    responseLagMinutes: 60,
    warning: {
      issuedAtHour: 3.5,
      validHours: 2,
      tag: 'considerable',
      ring: [
        [-90.2, 38.1],
        [-90.15, 38.1],
        [-90.15, 38.15],
        [-90.2, 38.15],
      ],
    },
  } satisfies z.input<typeof FlashEventParams>,
  fields: {
    basin: { label: 'Basin', help: 'Basin name used in the labels.' },
    gauge: {
      label: 'Stream gauge',
      help: 'JSON object: id (3 to 10 letters and digits), name, baseStage and peakStage (feet), categories ({ action, flood, minor, moderate, major } stages in feet), lonLat ([lon, lat], optional).',
    },
    start: { label: 'Start (UTC)', help: 'Hour 0 of the event, as an ISO date and time.' },
    stepMinutes: { label: 'Step (minutes)', help: 'Time between values, 5 to 60.' },
    durationHours: { label: 'Duration (hours)', help: '2 to 48 hours.' },
    rainPeakHour: {
      label: 'Heaviest rain (hour)',
      help: 'Hours after the start when the heaviest rain falls.',
    },
    rainDurationHours: { label: 'Rain duration (hours)', help: '0.5 to 24 hours.' },
    rainTotalInches: { label: 'Rain total (inches)', help: 'Total rainfall over the basin.' },
    responseLagMinutes: {
      label: 'Response lag (minutes)',
      help: 'Minutes from the rain peak to the stage peak; small basins respond in under an hour.',
    },
    warning: {
      label: 'Flash flood warning',
      help: 'Optional JSON object: issuedAtHour, validHours (up to 6), tag (base, considerable or catastrophic) and ring (the polygon as [lon, lat] points).',
    },
  },
  generate(p) {
    const { rain, stage } = flashSeries(p)
    const g = p.gauge
    const out: GeneratedDataset[] = [
      gaugeDataset(g, g.lonLat ?? [-90, 38]),
      {
        id: `rain-${g.id}`,
        kind: 'series',
        label: `${p.basin}: rainfall per period, simulated`,
        data: rain,
        unit: 'in',
        range: range(rain)!,
      },
      {
        id: `stage-${g.id}`,
        kind: 'series',
        label: `${g.name} (${g.id.toUpperCase()}): stage, simulated`,
        data: stage,
        unit: 'ft',
        range: range(stage)!,
      },
    ]
    const flood = g.categories.flood ?? g.categories.minor ?? g.categories.action
    if (flood !== undefined) {
      const crossed = stage.filter((x) => x.v >= flood)
      if (crossed.length)
        out.push({
          id: 'flash-flood-events',
          kind: 'features',
          label: `Flash flood reports at ${g.name}, simulated`,
          data: metricFile('events', [
            {
              id: 'first-flooding',
              time: crossed[0]!.t,
              area: p.basin,
              kind: 'flash_flood_report',
              attrs: { stageFt: crossed[0]!.v },
            },
          ]),
        })
    }
    if (p.warning) {
      const t0 = Date.parse(p.start)
      const issued = new Date(t0 + p.warning.issuedAtHour * 3_600_000)
        .toISOString()
        .replace('.000Z', 'Z')
      const expires = new Date(t0 + (p.warning.issuedAtHour + p.warning.validHours) * 3_600_000)
        .toISOString()
        .replace('.000Z', 'Z')
      out.push({
        id: 'flash-flood-warning',
        kind: 'features',
        label: `Flash flood warning polygon, ${p.basin}, simulated`,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [closeRing(p.warning.ring)] },
              properties: {
                kind: 'flash_flood_warning',
                tag: p.warning.tag,
                start: issued,
                end: expires,
                peakCategory: categoryOf(g.categories, g.peakStage),
              },
            },
          ],
        },
      })
    }
    return out
  },
}

const ReplayParams = z.object({
  gauge: z.object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9]{3,10}$/)
      .transform((s) => s.toLowerCase()),
    name: z.string().min(1).max(80),
  }),
  /** The observed series of the real event, oldest first. */
  observed: z
    .array(z.object({ t: IsoDateTime, v: z.number().finite() }))
    .min(3)
    .max(1500),
  issuances: z
    .array(
      z.object({
        /** Hours after the first observation. */
        atHour: z.number().min(0),
        /** Feet the forecast crest is off by (negative: too low). The error fades after the crest. */
        crestBiasFt: z.number().min(-30).max(30).default(0),
      }),
    )
    .min(1)
    .max(8),
})
export type ReplayParams = z.infer<typeof ReplayParams>

/** A value of the observed series at a time, linearly interpolated, clamped at the ends. */
function at(obs: readonly { t: number; v: number }[], t: number): number {
  if (t <= obs[0]!.t) return obs[0]!.v
  const last = obs.at(-1)!
  if (t >= last.t) return last.v
  const j = obs.findIndex((o) => o.t >= t)
  const a = obs[j - 1]!
  const b = obs[j]!
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t)
}

/** Forecasts for a replayed real event built from its observed rise (the real forecasts are not archived). */
export function replayForecasts(
  p: ReplayParams,
): { n: number; issuedAt: string; points: SimPoint[] }[] {
  const obs = [...p.observed].map((o) => ({ t: Date.parse(o.t), v: o.v })).sort((a, b) => a.t - b.t)
  const crest = obs.reduce((a, b) => (b.v > a.v ? b : a))
  const end = obs.at(-1)!.t
  return p.issuances.map((iss, i) => {
    const t0 = obs[0]!.t + iss.atHour * 3_600_000
    const points: SimPoint[] = []
    for (let t = t0; t <= Math.min(end, crest.t + 48 * 3_600_000) + 1; t += 6 * 3_600_000) {
      const toCrest = Math.max(crest.t - t0, 1)
      const w =
        t <= crest.t
          ? Math.min(1, (t - t0) / toCrest)
          : Math.max(0, 1 - (t - crest.t) / (48 * 3_600_000))
      points.push({
        t: new Date(t).toISOString().replace('.000Z', 'Z'),
        v: Math.round((at(obs, t) + iss.crestBiasFt * w) * 100) / 100,
      })
    }
    return { n: i + 1, issuedAt: new Date(t0).toISOString().replace('.000Z', 'Z'), points }
  })
}

export const replayForecastGenerator: SimulatedGenerator<ReplayParams> = {
  id: 'flood-replay-forecast',
  label: 'Simulated forecasts for a replayed event (built from its observed rise)',
  params: ReplayParams,
  description:
    'Forecasts for a replayed real flood, built from its observed rise because the real forecasts are not archived: each issuance follows the observed series with a crest error that fades after the crest. It writes one forecast series per issuance.',
  toolkits: ['flooding'],
  example: {
    gauge: { id: 'EADM7', name: 'Mississippi River at St. Louis' },
    observed: [
      { t: '2019-06-01T00:00:00Z', v: 30 },
      { t: '2019-06-02T00:00:00Z', v: 36.5 },
      { t: '2019-06-03T00:00:00Z', v: 42.1 },
      { t: '2019-06-04T00:00:00Z', v: 45 },
      { t: '2019-06-05T00:00:00Z', v: 41.8 },
    ],
    issuances: [
      { atHour: 24, crestBiasFt: -2 },
      { atHour: 48, crestBiasFt: 0 },
    ],
  } satisfies z.input<typeof ReplayParams>,
  fields: {
    gauge: {
      label: 'Gauge',
      help: 'JSON object: id (the NWS gauge id, 3 to 10 letters and digits) and name.',
    },
    observed: {
      label: 'Observed stage',
      help: 'JSON list of { t (ISO time), v (stage in feet) }, oldest first, at least 3 points; usually filled from the case data.',
    },
    issuances: {
      label: 'Forecast issuances',
      help: 'JSON list (1 to 8) of { atHour (hours after the first observation), crestBiasFt (feet the forecast crest is off by, negative when too low) }.',
    },
  },
  generate(p) {
    return replayForecasts(p).map((f) => ({
      id: `forecast-${p.gauge.id}-${f.n}`,
      kind: 'series' as const,
      label: `${p.gauge.name}: simulated forecast ${f.n} issued ${f.issuedAt}`,
      data: f.points,
      unit: 'ft',
      ...(range(f.points) ? { range: range(f.points)! } : {}),
    }))
  },
}
