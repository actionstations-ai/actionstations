// Simulated weather events (spec 0449 FR-8): generators that turn a few parameters into
// consistent case data when there is no real event to replay. The framework labels every dataset
// simulated; nothing here pretends to be a record. A convective event gives radar frames
// (reflectivity, velocity, correlation coefficient), storm reports along the track, the warning
// a forecaster would issue, a sounding and mesoanalysis grids that fit the storm mode, a model
// temperature panel and a station's observations as the storm passes. A tropical cyclone gives a
// best-track-like path and the wind at places along it, with the arrival of tropical-storm-force
// winds that hurricane decision timelines are measured against.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { registerGenerator } from '../../case-data/generators'
import type { MesoanalysisData, ModelPanelData } from '../../render/figures/weather/grid'
import type { RadarData } from '../../render/figures/weather/radar'
import { AppError } from '../../lib/errors'
import { gridOf, simulatedObservations, simulatedSounding, soundingIndices } from './simulate-env'
import {
  KM_PER_KT_MIN,
  noise,
  polarGeometry,
  stormCenter,
  stormScan,
  type StormParams,
} from './simulate-storm'
import { chainFrames } from './frames'

const MAX_FRAMES = 144

export const ConvectiveParams = z.object({
  start: z.iso.datetime({ offset: true }),
  durationMin: z.number().int().min(30).max(360).default(180),
  stepMin: z.number().int().min(1).max(15).default(5),
  radar: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    id: z.string().min(3).max(8).default('KSIM'),
    name: z.string().max(60).default('Simulated radar'),
  }),
  extentKm: z.number().min(50).max(300).default(150),
  storm: z.object({
    mode: z.enum(['supercell', 'line', 'multicell']).default('supercell'),
    startBearingDeg: z.number().min(0).max(360),
    startRangeKm: z.number().min(10).max(200),
    motionFromDeg: z.number().min(0).max(360).default(250),
    speedKt: z.number().min(5).max(70).default(35),
    peakDbz: z.number().min(45).max(75).default(62),
    tornado: z
      .object({
        startMin: z.number().min(0).max(360),
        endMin: z.number().min(0).max(360),
        rating: z.enum(['EF0', 'EF1', 'EF2', 'EF3', 'EF4']).default('EF1'),
      })
      .refine((t) => t.endMin > t.startMin, { message: 'the tornado must end after it starts' })
      .optional(),
    hailInches: z.number().min(0.5).max(4.5).default(1.75),
  }),
  /** How many minutes before the tornado starts the simulated office issues its warning. */
  warningLeadMin: z.number().min(0).max(40).default(12),
  seed: z.number().int().default(1),
})
export type ConvectiveParams = z.infer<typeof ConvectiveParams>

const iso = (ms: number): string => new Date(ms).toISOString()

interface Local {
  lat: number
  lon: number
}

const toLatLon = (r: Local, x: number, y: number): [number, number] => [
  r.lat + y / 110.57,
  r.lon + x / (111.32 * Math.cos((r.lat * Math.PI) / 180)),
]

/** County names of the simulated area: a 25 km grid, letters across and numbers up. */
export const countyName = (x: number, y: number): string =>
  `County ${String.fromCharCode(65 + Math.min(25, Math.max(0, Math.floor((x + 325) / 25) % 26)))}${Math.floor((y + 325) / 25)}`

function polygonAlong(
  p: StormParams,
  r: Local,
  fromMin: number,
  toMin: number,
  halfWidthKm: number,
) {
  const a = stormCenter(p, fromMin)
  const b = stormCenter(p, toMin)
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const px = -uy * halfWidthKm
  const py = ux * halfWidthKm
  const back = 5
  const pts = [
    [a.x - ux * back + px, a.y - uy * back + py],
    [b.x + ux * 3 + px, b.y + uy * 3 + py],
    [b.x + ux * 3 - px, b.y + uy * 3 - py],
    [a.x - ux * back - px, a.y - uy * back - py],
  ] as [number, number][]
  const ring = [...pts, pts[0]!].map(([x, y]) => {
    const [lat, lon] = toLatLon(r, x, y)
    return [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]
  })
  const counties = [
    ...new Set([a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }].map((c) => countyName(c.x, c.y))),
  ]
  return { ring, counties }
}

function warnings(
  params: ConvectiveParams,
  p: StormParams,
  startMs: number,
  endIso: string,
): GeneratedDataset {
  const { storm } = params
  const features: unknown[] = []
  const radar = params.radar
  if (storm.tornado) {
    const issue = Math.max(0, storm.tornado.startMin - params.warningLeadMin)
    const { ring, counties } = polygonAlong(p, radar, issue, issue + 45, 9)
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        name: 'Tornado Warning 1 (SIM)',
        ps: 'Tornado Warning',
        phenomena: 'TO',
        significance: 'W',
        eventid: 1,
        wfo: 'SIM',
        start: iso(startMs + issue * 60_000),
        end: iso(startMs + (issue + 45) * 60_000),
        counties,
        tornadotag: 'RADAR INDICATED',
        windtag: 60,
        hailtag: storm.hailInches,
      },
    })
  } else if (storm.peakDbz >= 55) {
    const issue = 10
    const { ring, counties } = polygonAlong(p, radar, issue, issue + 60, 12)
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        name: 'Severe Thunderstorm Warning 1 (SIM)',
        ps: 'Severe Thunderstorm Warning',
        phenomena: 'SV',
        significance: 'W',
        eventid: 1,
        wfo: 'SIM',
        start: iso(startMs + issue * 60_000),
        end: iso(startMs + (issue + 60) * 60_000),
        counties,
        windtag: 60,
        hailtag: storm.hailInches,
      },
    })
  }
  void endIso
  return {
    id: 'warnings',
    label: 'Simulated warning polygons',
    kind: 'features',
    data: { type: 'FeatureCollection', features },
    range: { start: iso(startMs), end: endIso },
  }
}

function stormReports(
  params: ConvectiveParams,
  p: StormParams,
  startMs: number,
  endIso: string,
): GeneratedDataset {
  const { storm, radar } = params
  const items: {
    kind: string
    minute: number
    x: number
    y: number
    magnitude: string
    remarks: string
  }[] = []
  const place = (minute: number, offsetKm: number) => {
    const c = stormCenter(p, minute)
    return { x: c.x + offsetKm, y: c.y - offsetKm / 2 }
  }
  if (storm.mode !== 'line' && storm.peakDbz >= 55)
    for (let m = 15; m <= params.durationMin; m += 10) {
      const pos = place(m, 2 + (noise(m, 1, p.seed) - 0.5) * 3)
      const size =
        Math.round((storm.hailInches * 100 * (0.75 + 0.5 * noise(m, 2, p.seed))) / 25) * 25
      items.push({
        kind: 'hail',
        minute: m + 4,
        ...pos,
        magnitude: String(size),
        remarks: 'Simulated report of hail from a trained spotter.',
      })
    }
  if (storm.mode === 'line')
    for (let m = 12; m <= params.durationMin; m += 8) {
      const pos = place(m, (noise(m, 3, p.seed) - 0.5) * 20)
      items.push({
        kind: 'wind',
        minute: m + 5,
        ...pos,
        magnitude: String(Math.round(55 + 20 * noise(m, 4, p.seed))),
        remarks: 'Simulated report of trees and power lines down.',
      })
    }
  if (storm.tornado) {
    const t = storm.tornado
    const rating = storm.tornado.rating
    for (const m of [t.startMin + 1, Math.round((t.startMin + t.endMin) / 2), t.endMin - 1]) {
      const pos = place(m, 0)
      items.push({
        kind: 'tornado',
        minute: m + 3,
        ...pos,
        magnitude: rating,
        remarks: `Simulated report of a tornado on the ground, damage consistent with ${rating}.`,
      })
    }
  }
  items.sort((a, b) => a.minute - b.minute)
  const counts: Record<string, number> = {}
  const features = items.map((r) => {
    const [lat, lon] = toLatLon(radar, r.x, r.y)
    const time = iso(startMs + r.minute * 60_000)
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4],
      },
      properties: {
        name: `${r.kind === 'wind' ? 'Wind damage' : r.kind === 'hail' ? 'Hail' : 'Tornado'} ${time.slice(11, 16)}Z ${countyName(r.x, r.y)}`,
        start: time,
        end: endIso,
        kind: r.kind,
        magnitude: r.magnitude,
        remarks: r.remarks,
      },
    }
  })
  const events = items.map((r, i) => {
    counts[r.kind] = (counts[r.kind] ?? 0) + 1
    const f = features[i]!.geometry.coordinates
    return {
      id: `${r.kind}-${String(counts[r.kind]).padStart(3, '0')}`,
      time: iso(startMs + r.minute * 60_000),
      area: countyName(r.x, r.y),
      kind: r.kind,
      attrs: { lat: f[1], lon: f[0], magnitude: r.magnitude, remarks: r.remarks },
    }
  })
  return {
    id: 'storm-reports',
    label: 'Simulated storm reports',
    kind: 'features',
    data: { type: 'FeatureCollection', features, events },
    range: { start: iso(startMs), end: endIso },
  }
}

export function generateConvective(params: ConvectiveParams): GeneratedDataset[] {
  const startMs = Date.parse(params.start)
  const endMs = startMs + params.durationMin * 60_000
  const endIso = iso(endMs)
  const frames = Math.floor(params.durationMin / params.stepMin) + 1
  if (frames > MAX_FRAMES)
    throw new AppError(
      'VALIDATION',
      `That is ${frames} radar frames; the most is ${MAX_FRAMES}. Shorten the period or use a longer step.`,
    )
  const s = params.storm
  const p: StormParams = {
    mode: s.mode,
    startBearingDeg: s.startBearingDeg,
    startRangeKm: s.startRangeKm,
    motionFromDeg: s.motionFromDeg,
    speedKt: s.speedKt,
    peakDbz: s.peakDbz,
    tornado: s.tornado,
    seed: params.seed,
  }
  const geo = polarGeometry(params.extentKm)
  const site = {
    id: params.radar.id,
    name: params.radar.name,
    lat: params.radar.lat,
    lon: params.radar.lon,
  }
  const bbox: [number, number, number, number] = (() => {
    const [la0, lo0] = toLatLon(params.radar, -params.extentKm, -params.extentKm)
    const [la1, lo1] = toLatLon(params.radar, params.extentKm, params.extentKm)
    return [lo0, la0, lo1, la1]
  })()
  const area = { label: params.radar.name, bbox }
  const names = {
    reflectivity: ['ref', 'reflectivity'],
    velocity: ['vel', 'radial velocity'],
    correlation_coefficient: ['cc', 'correlation coefficient'],
  } as const
  const perProduct: Record<keyof typeof names, { start: string; name: string; data: RadarData }[]> =
    {
      reflectivity: [],
      velocity: [],
      correlation_coefficient: [],
    }
  for (let k = 0; k < frames; k++) {
    const minute = k * params.stepMin
    const scan = stormScan(p, minute, geo)
    const time = iso(startMs + minute * 60_000)
    const fields = {
      reflectivity: scan.reflectivity,
      velocity: scan.velocity,
      correlation_coefficient: scan.correlation,
    }
    for (const product of Object.keys(names) as (keyof typeof names)[])
      perProduct[product].push({
        start: time,
        name: `${site.id} ${names[product][1]} ${time.slice(11, 16)}Z`,
        data: {
          origin: 'simulated',
          site,
          product,
          time,
          elevationDeg: 0.5,
          extentKm: params.extentKm,
          field: fields[product],
          overlays: { counties: [], places: [], polygons: [], motions: [] },
        },
      })
  }
  const frameData = (list: { start: string; name: string; data: unknown }[]) => ({
    type: 'FeatureCollection',
    features: chainFrames(list, endIso).map((f) => ({
      type: 'Feature',
      geometry: null,
      properties: { name: f.name, start: f.start, end: f.end, data: f.data },
    })),
  })
  const out: GeneratedDataset[] = (Object.keys(names) as (keyof typeof names)[]).map((product) => ({
    id: `radar-${site.id.toLowerCase()}-${names[product][0]}`,
    label: `Simulated radar ${site.id} ${names[product][1]}`,
    kind: 'features' as const,
    data: frameData(perProduct[product]),
    range: { start: params.start, end: endIso },
    area,
  }))
  out.push(stormReports(params, p, startMs, endIso), warnings(params, p, startMs, endIso))

  // Environment: a sounding an hour and a half before, grids each hour, and the observations.
  const launch = iso(startMs - 90 * 60_000)
  out.push({
    id: 'soundings-sim',
    label: 'Simulated sounding',
    kind: 'features',
    data: frameData([
      {
        start: launch,
        name: 'Simulated sounding',
        data: simulatedSounding(s.mode, launch, { id: 'KSIM', name: params.radar.name }),
      },
    ]),
    range: { start: launch, end: endIso },
    area,
  })
  const idx = soundingIndices(s.mode)
  const gridArea = { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3], nx: 60, ny: 45 }
  const sig = (v: number): number => 1 / (1 + Math.exp(-v))
  const ahead =
    (minute: number) =>
    (lat: number, lon: number): number => {
      const x = (lon - params.radar.lon) * 111.32 * Math.cos((params.radar.lat * Math.PI) / 180)
      const y = (lat - params.radar.lat) * 110.57
      const c = stormCenter(p, minute)
      const to = ((p.motionFromDeg + 180) % 360) * (Math.PI / 180)
      return ((x - c.x) * Math.sin(to) + (y - c.y) * Math.cos(to)) / 25
    }
  const hours = Math.floor(params.durationMin / 60) + 1
  const hourly = (make: (minute: number, time: string, hour: number) => unknown) =>
    Array.from({ length: hours }, (_, h) => {
      const time = iso(startMs + h * 3_600_000)
      return { start: time, name: time.slice(11, 16) + 'Z', data: make(h * 60, time, h) }
    })
  const overlays = { lines: [], places: [], polygons: [] }
  const meso = (
    id: string,
    label: string,
    parameter: MesoanalysisData['parameter'],
    contours: MesoanalysisData['contours'],
    value: (m: number) => (lat: number, lon: number) => number,
  ) =>
    out.push({
      id,
      label,
      kind: 'features',
      data: frameData(
        hourly(
          (m, time) =>
            ({
              origin: 'simulated',
              time,
              source: 'Simulated exercise analysis',
              parameter,
              contours,
              field: gridOf(gridArea, value(m)),
              overlays,
            }) satisfies MesoanalysisData,
        ),
      ),
      range: { start: params.start, end: endIso },
      area,
    })
  meso(
    'meso-cape',
    'Simulated mesoanalysis: surface-based CAPE',
    { label: 'Surface-based CAPE', unit: 'J/kg', palette: 'cape', threshold: 1000 },
    { interval: 500, from: 500 },
    (m) => {
      const a = ahead(m)
      return (lat, lon) => idx.cape * (0.25 + 0.75 * sig(a(lat, lon) * 2.2))
    },
  )
  meso(
    'meso-shear',
    'Simulated mesoanalysis: 0 to 6 km bulk shear',
    { label: '0 to 6 km bulk shear', unit: 'kt', palette: 'shear', threshold: 40 },
    { interval: 10, from: 20 },
    (m) => {
      const a = ahead(m)
      return (lat, lon) => idx.shear06Kt * (0.7 + 0.3 * sig(a(lat, lon) * 1.5))
    },
  )
  out.push({
    id: 'model-temp',
    label: 'Simulated model guidance: 2 m temperature',
    kind: 'features',
    data: frameData(
      hourly((m, time, h) => {
        const a = ahead(m)
        return {
          origin: 'simulated',
          time,
          model: { name: 'Simulated model', run: params.start, forecastHour: h },
          parameter: { label: '2 m temperature', unit: 'C', palette: 'temperature' },
          contours: { interval: 2 },
          field: gridOf(gridArea, (lat, lon) => 19 + 8 * sig(a(lat, lon) * 2.4)),
          overlays,
        } satisfies ModelPanelData
      }),
    ),
    range: { start: params.start, end: endIso },
    area,
  })
  const passage = Math.min(
    params.durationMin - 10,
    Math.max(
      20,
      Math.round((params.storm.startRangeKm * 0.45) / (params.storm.speedKt * KM_PER_KT_MIN)),
    ),
  )
  out.push({
    id: 'observations-sim',
    label: 'Simulated observations at a station on the track',
    kind: 'features',
    data: frameData([
      {
        start: params.start,
        name: 'Observations',
        data: simulatedObservations({
          station: { id: 'SIM1', name: 'Simulated station' },
          startIso: params.start,
          stepMin: params.stepMin,
          steps: frames,
          passageMin: passage,
          peakGustKt: s.mode === 'line' ? 62 : 45,
          seed: params.seed,
        }),
      },
    ]),
    range: { start: params.start, end: endIso },
    area,
  })
  return out
}

export const convectiveGenerator: SimulatedGenerator<ConvectiveParams> = {
  id: 'weather-convective',
  label: 'Simulated convective event (weather toolkit)',
  params: ConvectiveParams,
  generate: generateConvective,
}

registerGenerator(convectiveGenerator)
