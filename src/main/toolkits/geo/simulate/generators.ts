// Simulated earth science events as case-data generators (spec 0450 FR-11, ADR-0076, ADR-0092).
// Each is a pure, deterministic function of validated parameters (and a seed), built on the
// simple relations in models.ts. The framework labels the output simulated, names the generator
// and gives it no retrieval date. The datasets agree with each other by construction: the
// aftershock forecast and the aftershock sequence come from one rate, the early warning times and
// the ShakeMap come from one set of distances, and the debris flows come from the rainfall they
// are reported against.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import {
  aftershockForecast,
  destination,
  distanceKm,
  distanceToSegmentKm,
  eewTimes,
  expectedRangeText,
  intensityAt,
  percentText,
  poisson,
  rng,
  ruptureLengthKm,
  ruptureLine,
  sampleAftershocks,
  tsunamiMinutes,
  DEFAULT_ALERT_DELAY_S,
} from './models'

const Lon = z.number().min(-180).max(180)
const Lat = z.number().min(-90).max(90)
const Place = z.object({ name: z.string().min(1).max(60), lon: Lon, lat: Lat })
const Seed = z
  .number()
  .int()
  .min(0)
  .max(2 ** 31)
  .default(1)

const MIN = 60_000
const DAY = 86_400_000
const iso = (ms: number): string => new Date(ms).toISOString()
const r1 = (v: number): number => Math.round(v * 10) / 10
const r2 = (v: number): number => Math.round(v * 100) / 100

const point = (lon: number, lat: number, properties: Record<string, unknown>) => ({
  type: 'Feature' as const,
  geometry: {
    type: 'Point' as const,
    coordinates: [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4],
  },
  properties,
})
const collection = (features: unknown[]) => ({ type: 'FeatureCollection' as const, features })

// The timing measures read ground-truth events and modeled series from case data files. The case
// data pipeline checks a "reports" dataset as text entries (t, title, text), so these entries carry
// those three keys and, beside them, the keys the metric readers want (an event's id, time, kind,
// area and attrs; a series' zone, quantity and points). The extra keys survive in the file.
const eventEntry = (
  time: string,
  id: string,
  kind: string,
  title: string,
  area?: string,
  attrs: Record<string, unknown> = {},
) => ({
  t: time,
  title,
  text: `${title} (simulated)`,
  id,
  time,
  kind,
  ...(area ? { area } : {}),
  attrs,
})

/** One zone's quantity as a step: zero until `at`, then `value` (the threshold is crossed at `at`). */
const stepSeries = (zone: string, quantity: string, start: number, at: number, value: number) => {
  const before = Math.max(start, at - 100)
  const points = [
    ...(before > start ? [{ time: iso(start), value: 0 }] : []),
    { time: iso(before), value: 0 },
    { time: iso(at), value: value },
  ]
  return {
    t: iso(start),
    title: `${zone}: ${quantity}`,
    text: `${quantity} at ${zone} (simulated)`,
    zone,
    quantity,
    points,
  }
}

// ---- earthquake, shaking, aftershocks, early warning ------------------------------------------

export const EarthquakeParams = z.object({
  name: z.string().min(1).max(80).default('Exercise earthquake'),
  epicenter: z.object({ lon: Lon, lat: Lat }),
  magnitude: z.number().min(4).max(9.2),
  depthKm: z.number().min(1).max(80).default(15),
  originTime: IsoDateTime,
  /** Direction of the fault, degrees clockwise from north. */
  strikeDeg: z.number().min(0).max(359).default(0),
  places: z.array(Place).max(10).default([]),
  gridCols: z.number().int().min(10).max(100).default(40),
  gridRows: z.number().int().min(10).max(100).default(32),
  aftershockDays: z.number().min(1).max(365).default(30),
  aftershockMinMagnitude: z.number().min(2).max(4).default(2.5),
  /** Days after the mainshock at which the aftershock forecast is issued. */
  forecastAtDays: z.number().min(0).max(30).default(0.25),
  alertDelaySec: z.number().min(2).max(30).default(DEFAULT_ALERT_DELAY_S),
  seed: Seed,
})
export type EarthquakeParams = z.infer<typeof EarthquakeParams>

function forecastText(p: EarthquakeParams): string {
  const issued = new Date(Date.parse(p.originTime) + p.forecastAtDays * DAY)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')
  const lines = aftershockForecast(p.magnitude, p.forecastAtDays).map(
    (w) =>
      `${w.label}: ` +
      w.rows
        .map(
          (r) =>
            `M ${r.minMagnitude} or larger ${percentText(r.chance)} chance (expected ${expectedRangeText(r.expected)})`,
        )
        .join('; '),
  )
  return [
    `Simulated aftershock forecast for M ${p.magnitude}, issued ${issued} UTC.`,
    ...lines,
    'These are chances, not predictions. Aftershocks become less frequent with time, and a larger earthquake than the mainshock is possible but unlikely.',
  ].join('\n')
}

export function simulateEarthquake(p: EarthquakeParams): GeneratedDataset[] {
  const t0 = Date.parse(p.originTime)
  const [a, b] = ruptureLine(p.epicenter, p.magnitude, p.strikeDeg)
  const length = ruptureLengthKm(p.magnitude)
  const distTo = (q: { lon: number; lat: number }): number => distanceToSegmentKm(q, a, b)
  // The map covers the rupture and the shaking down to about intensity IV.
  const reach = Math.max(120, Math.min(600, length * 2 + 200 * (p.magnitude - 5)))
  const sw = destination(destination(p.epicenter, 270, reach), 180, reach)
  const ne = destination(destination(p.epicenter, 90, reach), 0, reach)
  const grid = {
    west: r2(sw.lon),
    south: r2(sw.lat),
    east: r2(ne.lon),
    north: r2(ne.lat),
    cols: p.gridCols,
    rows: p.gridRows,
    values: [] as number[],
  }
  const dx = (grid.east - grid.west) / grid.cols
  const dy = (grid.north - grid.south) / grid.rows
  let maxMmi = 0
  for (let r = 0; r < grid.rows; r++)
    for (let c = 0; c < grid.cols; c++) {
      const v = intensityAt(
        p.magnitude,
        distTo({ lon: grid.west + (c + 0.5) * dx, lat: grid.north - (r + 0.5) * dy }),
      )
      maxMmi = Math.max(maxMmi, v)
      grid.values.push(v)
    }
  const ring = [
    [grid.west, grid.south],
    [grid.east, grid.south],
    [grid.east, grid.north],
    [grid.west, grid.north],
    [grid.west, grid.south],
  ]
  const rand = rng(p.seed + 17)
  const events = sampleAftershocks(
    p.magnitude,
    p.aftershockMinMagnitude,
    p.aftershockDays,
    p.seed,
  ).map((e) => {
    const along = rand()
    const spread = (rand() - 0.5) * length * 0.25
    const base = { lon: a.lon + (b.lon - a.lon) * along, lat: a.lat + (b.lat - a.lat) * along }
    const loc = destination(base, p.strikeDeg + 90, spread)
    return point(loc.lon, loc.lat, {
      name: `M ${e.magnitude} aftershock`,
      magnitude: e.magnitude,
      time: iso(t0 + e.t * DAY),
      daysAfter: e.t,
    })
  })
  const places = p.places.map((pl) => {
    const rupture = distTo(pl)
    const epi = distanceKm(p.epicenter, pl)
    const { name, ...times } = eewTimes(pl.name, epi, p.depthKm, p.alertDelaySec)
    return point(pl.lon, pl.lat, { name, mmi: intensityAt(p.magnitude, rupture), ...times })
  })
  const end = t0 + p.aftershockDays * DAY
  return [
    {
      id: 'sim-quake-event',
      label: `Simulated earthquake: M ${p.magnitude}, ${p.name}`,
      kind: 'features',
      data: collection([
        point(p.epicenter.lon, p.epicenter.lat, {
          name: `M ${p.magnitude} - ${p.name}`,
          magnitude: p.magnitude,
          magnitudeType: 'Mw',
          time: p.originTime,
          depthKm: p.depthKm,
          strikeDeg: p.strikeDeg,
          ruptureLengthKm: r1(length),
          maxMmi: r1(maxMmi),
          status: 'simulated',
        }),
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [a.lon, a.lat],
              [b.lon, b.lat],
            ],
          },
          properties: { name: 'Rupture (simulated)' },
        },
      ]),
      range: { start: p.originTime, end: iso(end) },
    },
    {
      id: 'sim-shakemap-grid',
      label: 'Simulated shaking intensity (MMI)',
      kind: 'features',
      data: collection([
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { name: 'Simulated intensity grid', grid },
        },
      ]),
      unit: 'MMI',
      area: { label: p.name, bbox: [grid.west, grid.south, grid.east, grid.north] },
    },
    {
      id: 'sim-places-shaking',
      label: 'Simulated shaking and early warning at places',
      kind: 'features',
      data: collection(places),
    },
    {
      id: 'sim-quake-events',
      label:
        'Simulated earthquake events for scoring: the origin and the strong shaking at each place',
      kind: 'reports',
      data: [
        eventEntry(
          p.originTime,
          'quake-origin',
          'earthquake_origin',
          `M ${p.magnitude} earthquake`,
        ),
        ...places.map((f) =>
          eventEntry(
            iso(t0 + Number(f.properties.shakingSec) * 1000),
            `shaking-${String(f.properties.name)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')}`,
            'shaking_arrival',
            `Strong shaking at ${f.properties.name}`,
            String(f.properties.name),
            { mmi: f.properties.mmi, warningSec: f.properties.warningSec },
          ),
        ),
      ],
      range: { start: p.originTime, end: iso(end) },
    },
    {
      id: 'sim-shaking-series',
      label:
        'Simulated shaking intensity at each place (MMI, reaches its value when strong shaking arrives)',
      kind: 'reports',
      data: places.map((f) =>
        stepSeries(
          String(f.properties.name),
          'MMI',
          t0,
          t0 + Number(f.properties.shakingSec) * 1000,
          Number(f.properties.mmi),
        ),
      ),
      range: { start: p.originTime, end: iso(end) },
    },
    {
      id: 'sim-aftershocks',
      label: `Simulated aftershocks, ${p.aftershockDays} days`,
      kind: 'features',
      data: collection(events),
      range: { start: p.originTime, end: iso(end) },
    },
    {
      id: 'sim-aftershock-forecast',
      label: 'Simulated aftershock forecast',
      kind: 'text',
      data: [
        {
          t: iso(t0 + p.forecastAtDays * DAY),
          title: 'Aftershock forecast (simulated)',
          text: forecastText(p),
        },
      ],
    },
  ]
}

// ---- volcanic unrest ------------------------------------------------------------------------------

export const UnrestParams = z.object({
  volcano: Place,
  startTime: IsoDateTime,
  days: z.number().int().min(5).max(90).default(30),
  /** Day (from the start) the eruption begins; absent for unrest that does not erupt. */
  eruptionDay: z.number().min(1).max(90).optional(),
  baselineQuakesPerDay: z.number().min(1).max(50).default(6),
  seed: Seed,
})
export type UnrestParams = z.infer<typeof UnrestParams>

export const ALERT_LEVELS = ['NORMAL', 'ADVISORY', 'WATCH', 'WARNING'] as const
const COLOR = ['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const

/** The documented rule: how many times the background rate, or an eruption, sets the level. */
export function alertLevelFor(rateOverBaseline: number, erupting: boolean): number {
  if (erupting) return 3
  if (rateOverBaseline >= 8) return 2
  if (rateOverBaseline >= 3) return 1
  return 0
}

export function simulateUnrest(p: UnrestParams): GeneratedDataset[] {
  if (p.eruptionDay !== undefined && p.eruptionDay > p.days)
    throw new Error('The eruption day is after the last day')
  const rand = rng(p.seed)
  const t0 = Date.parse(p.startTime)
  const end = p.eruptionDay ?? p.days
  const onset = end * 0.35
  const peakFactor = p.eruptionDay !== undefined ? 30 : 12
  const k = Math.log(peakFactor) / Math.max(1, end - onset)
  const steps = p.days * 4
  const quakes: unknown[] = []
  const tilt: unknown[] = []
  const gps: unknown[] = []
  const so2: unknown[] = []
  const level: unknown[] = []
  for (let i = 0; i <= steps; i++) {
    const day = i / 4
    const ms = t0 + day * DAY
    const erupting = p.eruptionDay !== undefined && day >= p.eruptionDay && day < p.eruptionDay + 2
    const afterErupt = p.eruptionDay !== undefined && day >= p.eruptionDay
    const growth = day <= onset ? 1 : Math.exp(k * Math.min(day, end) - k * onset)
    const factor =
      afterErupt && !erupting
        ? Math.max(1, growth * Math.exp(-(day - p.eruptionDay! - 2) / 4))
        : growth
    const rate = p.baselineQuakesPerDay * factor
    const t = iso(ms)
    quakes.push({ t, v: poisson(rate, rand) })
    const rise = Math.max(0, Math.min(day, end) - onset)
    tilt.push({ t, v: r1(0.4 * day + 0.9 * rise ** 1.5 * (1 + (rand() - 0.5) * 0.04)) })
    gps.push({ t, v: r2(0.12 * day + 0.28 * rise ** 1.4 * (1 + (rand() - 0.5) * 0.04)) })
    so2.push({ t, v: Math.round(40 * (1 + (factor - 1) * 0.5) * (1 + (rand() - 0.5) * 0.1)) })
    level.push({ t, v: { level: alertLevelFor(factor, erupting) } })
  }
  const range = { start: p.startTime, end: iso(t0 + p.days * DAY) }
  const eruptionFeatures =
    p.eruptionDay !== undefined
      ? [
          point(p.volcano.lon, p.volcano.lat, {
            name: `Eruption onset, ${p.volcano.name}`,
            time: iso(t0 + p.eruptionDay * DAY),
            kind: 'eruption onset',
          }),
        ]
      : []
  return [
    {
      id: 'sim-unrest-seismicity',
      label: `Simulated earthquakes per day, ${p.volcano.name}`,
      kind: 'series',
      data: quakes,
      unit: 'per day',
      range,
    },
    {
      id: 'sim-unrest-tilt',
      label: `Simulated summit tilt, ${p.volcano.name}`,
      kind: 'series',
      data: tilt,
      unit: 'microradians',
      range,
    },
    {
      id: 'sim-unrest-gps',
      label: `Simulated GPS uplift, ${p.volcano.name}`,
      kind: 'series',
      data: gps,
      unit: 'cm',
      range,
    },
    {
      id: 'sim-unrest-so2',
      label: `Simulated sulfur dioxide emission, ${p.volcano.name}`,
      kind: 'series',
      data: so2,
      unit: 't/day',
      range,
    },
    {
      id: 'sim-unrest-alert-level',
      label: `Simulated alert level (0 ${ALERT_LEVELS[0]}/${COLOR[0]}, 1 ${ALERT_LEVELS[1]}/${COLOR[1]}, 2 ${ALERT_LEVELS[2]}/${COLOR[2]}, 3 ${ALERT_LEVELS[3]}/${COLOR[3]})`,
      kind: 'series',
      data: level,
      range,
    },
    {
      id: 'sim-unrest-events',
      label: 'Simulated volcanic events for scoring: the eruption onset, if there is one',
      kind: 'reports',
      data:
        p.eruptionDay !== undefined
          ? [
              eventEntry(
                iso(t0 + p.eruptionDay * DAY),
                'eruption-onset',
                'eruption_onset',
                `Eruption onset, ${p.volcano.name}`,
                p.volcano.name,
              ),
            ]
          : [],
      range,
    },
    {
      id: 'sim-unrest-eruption',
      label:
        p.eruptionDay !== undefined
          ? 'Simulated eruption onset'
          : 'Simulated unrest without an eruption',
      kind: 'features',
      data: collection(eruptionFeatures),
      range,
    },
  ]
}

// ---- tsunami ------------------------------------------------------------------------------------

export const TsunamiParams = z.object({
  source: Place,
  magnitude: z.number().min(6.5).max(9.5),
  originTime: IsoDateTime,
  meanDepthM: z.number().min(200).max(6000).default(3000),
  places: z.array(Place).min(1).max(15),
  /** The place whose tide gauge record is simulated (default: the first). */
  gaugePlace: z.string().max(60).optional(),
  waveHeightM: z.number().min(0.1).max(15).default(1.2),
  wavePeriodMin: z.number().min(5).max(90).default(25),
  tideAmplitudeM: z.number().min(0).max(4).default(1),
})
export type TsunamiParams = z.infer<typeof TsunamiParams>

export function simulateTsunami(p: TsunamiParams): GeneratedDataset[] {
  const t0 = Date.parse(p.originTime)
  const arrivals = p.places.map((pl) => {
    const d = distanceKm(p.source, pl)
    const minutes = tsunamiMinutes(d, p.meanDepthM)
    return { pl, d, minutes }
  })
  const gauge = arrivals.find((a) => a.pl.name === p.gaugePlace) ?? arrivals[0]!
  const arrive = t0 + gauge.minutes * MIN
  const start = arrive - 120 * MIN
  const endMs = arrive + 12 * 60 * MIN
  const obs: unknown[] = []
  for (let ms = start; ms <= endMs; ms += 6 * MIN) {
    const tideHours = (ms - t0) / 3_600_000
    const tide = p.tideAmplitudeM * Math.sin((2 * Math.PI * tideHours) / 12.42)
    const since = (ms - arrive) / MIN
    const wave =
      since < 0
        ? 0
        : p.waveHeightM *
          Math.sin((2 * Math.PI * since) / p.wavePeriodMin) *
          (1 - Math.exp(-since / (p.wavePeriodMin * 1.5))) *
          Math.exp(-since / 240)
    obs.push({ t: iso(ms), v: r2(tide + wave) })
  }
  return [
    {
      id: 'sim-tsunami-arrivals',
      label: `Simulated tsunami arrival times from ${p.source.name}`,
      kind: 'features',
      data: collection([
        point(p.source.lon, p.source.lat, {
          name: `Source: ${p.source.name}`,
          magnitude: p.magnitude,
          time: p.originTime,
          kind: 'source',
        }),
        ...arrivals.map((a) =>
          point(a.pl.lon, a.pl.lat, {
            name: a.pl.name,
            distanceKm: Math.round(a.d),
            travelMinutes: a.minutes,
            arrivalTime: iso(t0 + a.minutes * MIN),
            sourceKind: a.minutes < 60 ? 'local (minutes)' : 'distant (hours)',
          }),
        ),
      ]),
      range: { start: p.originTime, end: iso(endMs) },
    },
    {
      id: 'sim-tsunami-gauge',
      label: `Simulated tide gauge record, ${gauge.pl.name} (m)`,
      kind: 'series',
      data: obs,
      unit: 'm',
      range: { start: iso(start), end: iso(endMs) },
    },
    {
      id: 'sim-tsunami-events',
      label: 'Simulated tsunami events for scoring: the first wave at each place',
      kind: 'reports',
      data: arrivals.map((a) =>
        eventEntry(
          iso(t0 + a.minutes * MIN),
          `first-wave-${a.pl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          'first_wave_observed',
          `First wave at ${a.pl.name}`,
          a.pl.name,
          {
            travelMinutes: a.minutes,
          },
        ),
      ),
      range: { start: p.originTime, end: iso(endMs) },
    },
    {
      id: 'sim-tsunami-wave-series',
      label: 'Simulated tsunami at each place (0 before the first wave, 1 when it arrives)',
      kind: 'reports',
      data: arrivals.map((a) =>
        stepSeries(a.pl.name, 'first wave arrived (0 or 1)', t0, t0 + a.minutes * MIN, 1),
      ),
      range: { start: p.originTime, end: iso(endMs) },
    },
  ]
}

// ---- debris flows from a rainfall scenario ---------------------------------------------------------

export const DebrisFlowParams = z.object({
  fire: z.string().min(1).max(80),
  startTime: IsoDateTime,
  peakIntensityMmHr: z.number().min(2).max(150),
  durationMin: z.number().int().min(30).max(720).default(180),
  /** Rain over 15 minutes (mm) at which a basin without its own threshold produces a flow. */
  thresholdMm15: z.number().min(1).max(40).default(6),
  basins: z
    .array(Place.extend({ thresholdMm15: z.number().min(1).max(40).optional() }))
    .min(1)
    .max(20),
})
export type DebrisFlowParams = z.infer<typeof DebrisFlowParams>

export function volumeClass(ratio: number): string {
  if (ratio < 1.25) return 'small (under 1,000 cubic meters)'
  if (ratio < 2) return 'medium (1,000 to 10,000 cubic meters)'
  return 'large (over 10,000 cubic meters)'
}

export function simulateDebrisFlows(p: DebrisFlowParams): GeneratedDataset[] {
  const t0 = Date.parse(p.startTime)
  const step = 5
  const n = Math.floor(p.durationMin / step)
  const peakAt = p.durationMin / 2
  const sigma = p.durationMin / 5
  const intensity: unknown[] = []
  const mm5: number[] = []
  for (let i = 0; i <= n; i++) {
    const m = i * step
    const mmHr = p.peakIntensityMmHr * Math.exp(-(((m - peakAt) / sigma) ** 2))
    intensity.push({ t: iso(t0 + m * MIN), v: r1(mmHr) })
    mm5.push(mmHr / 12)
  }
  const roll15: { t: number; v: number }[] = mm5.map((_, i) => ({
    t: t0 + i * step * MIN,
    v: r2(mm5.slice(Math.max(0, i - 2), i + 1).reduce((s, x) => s + x, 0)),
  }))
  const peak15 = Math.max(...roll15.map((r) => r.v))
  const flows = p.basins.flatMap((b) => {
    const threshold = b.thresholdMm15 ?? p.thresholdMm15
    const hit = roll15.find((r) => r.v >= threshold)
    if (!hit) return []
    return [
      point(b.lon, b.lat, {
        name: `Debris flow, ${b.name}`,
        basin: b.name,
        time: iso(hit.t),
        thresholdMm15: threshold,
        peak15Mm: peak15,
        volumeClass: volumeClass(peak15 / threshold),
      }),
    ]
  })
  const flowTimes = p.basins.flatMap((b) => {
    const threshold = b.thresholdMm15 ?? p.thresholdMm15
    const hit = roll15.find((r) => r.v >= threshold)
    return hit ? [{ name: b.name, time: hit.t, threshold }] : []
  })
  const range = { start: p.startTime, end: iso(t0 + p.durationMin * MIN) }
  return [
    {
      id: 'sim-rainfall',
      label: `Simulated rainfall intensity over the ${p.fire} burn area`,
      kind: 'series',
      data: intensity,
      unit: 'mm/h',
      range,
    },
    {
      id: 'sim-rain-15min',
      label: 'Simulated 15-minute rainfall accumulation',
      kind: 'series',
      data: roll15.map((r) => ({ t: iso(r.t), v: r.v })),
      unit: 'mm',
      range,
    },
    {
      id: 'sim-debris-events',
      label: 'Simulated debris-flow events for scoring: one per basin that crosses its threshold',
      kind: 'reports',
      data: flowTimes.map((f) =>
        eventEntry(
          iso(f.time),
          `debris-flow-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          'debris_flow',
          `Debris flow, ${f.name}`,
          f.name,
          { thresholdMm15: f.threshold },
        ),
      ),
      range,
    },
    {
      id: 'sim-debris-series',
      label:
        'Simulated 15-minute rain at each basin as a share of its threshold (1 means the threshold is crossed)',
      kind: 'reports',
      data: p.basins.map((b) => {
        const threshold = b.thresholdMm15 ?? p.thresholdMm15
        return {
          t: iso(t0),
          title: `${b.name}: rain share of threshold`,
          text: `15-minute rain as a share of the ${threshold} mm threshold at ${b.name} (simulated)`,
          zone: b.name,
          quantity: '15-minute rain as a share of the threshold',
          points: roll15.map((r) => ({
            time: iso(r.t),
            value: Math.round((r.v / threshold) * 1000) / 1000,
          })),
        }
      }),
      range,
    },
    {
      id: 'sim-debris-flows',
      label: `Simulated debris flows below the ${p.fire} burn area`,
      kind: 'features',
      data: collection(flows),
      range,
    },
  ]
}

// ---- lahar -------------------------------------------------------------------------------------

export const LaharParams = z.object({
  source: Place,
  detectedAt: IsoDateTime,
  communities: z
    .array(Place.extend({ minutes: z.number().min(1).max(1440) }))
    .min(1)
    .max(12),
})
export type LaharParams = z.infer<typeof LaharParams>

export function simulateLahar(p: LaharParams): GeneratedDataset[] {
  const t0 = Date.parse(p.detectedAt)
  const slug = (n: string): string => n.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const end = t0 + Math.max(...p.communities.map((c) => c.minutes)) * MIN + 30 * MIN
  const range = { start: p.detectedAt, end: iso(end) }
  return [
    {
      id: 'sim-lahar-travel',
      label: `Simulated lahar travel times from ${p.source.name}`,
      kind: 'features',
      data: collection([
        point(p.source.lon, p.source.lat, {
          name: `Detection: ${p.source.name}`,
          time: p.detectedAt,
          kind: 'detection',
        }),
        ...p.communities.map((c) =>
          point(c.lon, c.lat, {
            name: c.name,
            distanceKm: Math.round(distanceKm(p.source, c)),
            travelMinutes: c.minutes,
            arrivalTime: iso(t0 + c.minutes * MIN),
          }),
        ),
      ]),
      range,
    },
    {
      id: 'sim-lahar-events',
      label: 'Simulated lahar events for scoring: the arrival at each community',
      kind: 'reports',
      data: p.communities.map((c) =>
        eventEntry(
          iso(t0 + c.minutes * MIN),
          `lahar-${slug(c.name)}`,
          'lahar_arrival',
          `Lahar reaches ${c.name}`,
          c.name,
          { travelMinutes: c.minutes },
        ),
      ),
      range,
    },
    {
      id: 'sim-lahar-series',
      label: 'Simulated lahar at each community (0 before it arrives, 1 when it does)',
      kind: 'reports',
      data: p.communities.map((c) =>
        stepSeries(c.name, 'lahar arrived (0 or 1)', t0, t0 + c.minutes * MIN, 1),
      ),
      range,
    },
  ]
}

// ---- registry ---------------------------------------------------------------------------------

export const GEO_GENERATORS: SimulatedGenerator[] = [
  {
    id: 'sim-earthquake',
    label: 'Simulated earthquake, shaking, aftershocks and early warning',
    params: EarthquakeParams,
    generate: simulateEarthquake,
  },
  {
    id: 'sim-volcanic-unrest',
    label: 'Simulated volcanic unrest',
    params: UnrestParams,
    generate: simulateUnrest,
  },
  {
    id: 'sim-lahar',
    label: 'Simulated lahar arrival times',
    params: LaharParams,
    generate: simulateLahar,
  },
  {
    id: 'sim-tsunami',
    label: 'Simulated tsunami arrival times and tide gauge record',
    params: TsunamiParams,
    generate: simulateTsunami,
  },
  {
    id: 'sim-debris-flow',
    label: 'Simulated debris flows from a rainfall scenario',
    params: DebrisFlowParams,
    generate: simulateDebrisFlows,
  },
] as SimulatedGenerator[]
