// Trajectory import and the simulated spill and plume generators (#771). The import fixture is
// built to the structure the PyGNOME GeoJSON outputter documents (one FeatureCollection per output
// step, Point features with current_time in seconds, spill_type FORECAST or UNCERTAIN, step_num);
// it is not the output of a real run.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { clearGenerators, generatorIds, runGenerator } = await import('../../case-data/generators')
const { readManifest } = await import('../../case-data/store')
const { SPILL_GENERATORS, generatePlume, generateSpill, registerSpillGenerators } =
  await import('./generators')
const { importTrajectory, readParticles, timeOf, TrajectoryImportParams } =
  await import('./trajectory-import')

const T0 = Date.UTC(2026, 10, 4, 12) / 1000

/** One PyGNOME-style output step: particles around a center drifting east. */
function step(n: number, uncertainToo = true) {
  const lon = -88.1 + n * 0.01
  const point = (dx: number, dy: number, type: string, i: number) => ({
    type: 'Feature',
    id: i,
    geometry: { type: 'Point', coordinates: [lon + dx, 30.3 + dy] },
    properties: {
      current_time: T0 + n * 3600,
      status_code: 2,
      spill_id: 'c0ffee',
      depth: 0,
      spill_type: type,
      step_num: n,
    },
  })
  const certain = [
    point(0, 0, 'FORECAST', 1),
    point(0.003, 0.001, 'FORECAST', 2),
    point(-0.002, 0.003, 'FORECAST', 3),
    point(0.001, -0.003, 'FORECAST', 4),
  ]
  const uncertain = uncertainToo
    ? [point(0.01, 0.006, 'UNCERTAIN', 5), point(-0.008, -0.007, 'UNCERTAIN', 6)]
    : []
  return { type: 'FeatureCollection', features: [...certain, ...uncertain] }
}
const file = (steps: unknown[]): string => JSON.stringify(steps)

const params = (content: string, over: Record<string, unknown> = {}) =>
  TrajectoryImportParams.parse({ content, model: 'WebGNOME', runDate: '2026-11-03', ...over })

describe('trajectory import: reading the file', () => {
  it('reads times as epoch seconds, milliseconds or ISO text', () => {
    expect(timeOf({ current_time: 1_700_000_000 })).toBe(1_700_000_000_000)
    expect(timeOf({ current_time: 1_700_000_000_000 })).toBe(1_700_000_000_000)
    expect(timeOf({ time: '2026-11-04T12:00:00Z' })).toBe(Date.UTC(2026, 10, 4, 12))
    expect(timeOf({ t: '1700000000' })).toBe(1_700_000_000_000)
    expect(timeOf({ other: 1 })).toBeUndefined()
    expect(timeOf(null)).toBeUndefined()
  })

  it('reads a list of steps, a single collection and MultiPoint features', () => {
    expect(readParticles(file([step(0), step(1)]))).toHaveLength(12)
    expect(readParticles(JSON.stringify(step(0)))).toHaveLength(6)
    const multi = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [-88, 30],
              [-88.1, 30.1],
            ],
          },
          properties: { time: '2026-11-04T12:00:00Z' },
        },
      ],
    }
    expect(readParticles(JSON.stringify(multi))).toHaveLength(2)
  })

  it('marks uncertainty points and ignores points with no time or an impossible place', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-88, 30] },
          properties: { time: 1_700_000_000, uncertain: true },
        },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-88, 30] }, properties: {} },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [500, 30] },
          properties: { time: 1_700_000_000 },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          properties: { time: 1_700_000_000 },
        },
      ],
    }
    const out = readParticles(JSON.stringify(fc))
    expect(out).toHaveLength(1)
    expect(out[0]!.uncertain).toBe(true)
  })

  it('refuses text that is not JSON and a file with nothing usable', () => {
    expect(() => readParticles('not json')).toThrow(/not valid JSON/)
    expect(() => readParticles('{"type":"FeatureCollection","features":[]}')).toThrow(
      /no points with a time/,
    )
    expect(() => readParticles('[1,2,3]')).toThrow(/no points with a time/)
  })

  it('refuses a file with too many points', () => {
    const features = Array.from({ length: 200_001 }, () => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-88, 30] },
      properties: { time: 1_700_000_000 },
    }))
    expect(() => readParticles(JSON.stringify({ type: 'FeatureCollection', features }))).toThrow(
      /more than 200000 points/,
    )
  })

  it('needs a run date and keeps the file text within the size limit', () => {
    expect(() =>
      TrajectoryImportParams.parse({ content: file([step(0)]), runDate: 'yesterday' }),
    ).toThrow()
    expect(() =>
      TrajectoryImportParams.parse({ content: 'x'.repeat(8_000_001), runDate: '2026-11-03' }),
    ).toThrow()
  })
})

describe('trajectory import: the case data', () => {
  const out = importTrajectory(
    params(file([step(0), step(1), step(2)]), { inputs: 'HYCOM currents, NAM winds' }),
  )

  it('makes a best-estimate cloud, an uncertainty cloud and a center for each time, then the track', () => {
    const fc = (
      out[0]!.data as {
        features: { geometry: { type: string }; properties: Record<string, unknown> }[]
      }
    ).features
    const kinds = fc.map((f) => f.properties.kind)
    expect(kinds.filter((k) => k === 'best_estimate')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'uncertainty')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'centroid')).toHaveLength(3)
    expect(kinds.at(-1)).toBe('track')
    expect(fc.at(-1)!.geometry.type).toBe('LineString')
  })

  it('is active from one output time to the next, and the last for the usual interval', () => {
    const fc = (out[0]!.data as { features: { properties: Record<string, string> }[] }).features
    const first = fc[0]!.properties
    expect(first.start).toBe('2026-11-04T12:00:00.000Z')
    expect(first.end).toBe('2026-11-04T13:00:00.000Z')
    const lastBest = fc.filter((f) => f.properties.kind === 'best_estimate').at(-1)!.properties
    expect(lastBest.end).toBe('2026-11-04T15:00:00.000Z')
  })

  it('moves with the oil: the centers go east and the best estimate is smaller than the uncertainty', () => {
    const fc = (
      out[0]!.data as {
        features: { geometry: { coordinates: unknown }; properties: Record<string, unknown> }[]
      }
    ).features
    const centers = fc
      .filter((f) => f.properties.kind === 'centroid')
      .map((f) => (f.geometry.coordinates as number[])[0]!)
    expect(centers[1]!).toBeGreaterThan(centers[0]!)
    expect(centers[2]!).toBeGreaterThan(centers[1]!)
    const best = fc.find((f) => f.properties.kind === 'best_estimate')!.properties.radiusM as number
    expect(best).toBeGreaterThan(100)
    expect(best).toBeLessThan(1000)
  })

  it('labels the model and run date, keeps the inputs in a note and says the app did not compute it', () => {
    expect(out[0]).toMatchObject({
      id: 'trajectory',
      kind: 'features',
      label: 'WebGNOME trajectory, run 2026-11-03',
    })
    expect(out[0]!.range).toEqual({
      start: '2026-11-04T12:00:00.000Z',
      end: '2026-11-04T14:00:00.000Z',
    })
    expect(out[0]!.area!.bbox![0]).toBeLessThan(-88.1)
    expect(TextFile.safeParse(out[1]!.data).success).toBe(true)
    const note = (out[1]!.data as { text: string }[])[0]!.text
    expect(note).toContain('did not compute it')
    expect(note).toContain('Inputs: HYCOM currents, NAM winds')
    expect(note).toContain('Output times: 3')
  })

  it('uses the uncertain points as the estimate when a time has only those', () => {
    const only = {
      type: 'FeatureCollection',
      features: step(0).features.filter((f) => f.properties.spill_type === 'UNCERTAIN'),
    }
    const o = importTrajectory(params(file([only])))
    const kinds = (
      o[0]!.data as { features: { properties: Record<string, unknown> }[] }
    ).features.map((f) => f.properties.kind)
    expect(kinds).toContain('best_estimate')
  })
})

describe('simulated spill and plume generators', () => {
  const spill = generateSpill({
    start: '2026-11-04T12:00:00Z',
    origin: { lat: 30.3, lon: -88.1 },
    product: 'diesel',
    volume: 4200,
    unit: 'bbl',
    releaseHours: 4,
    hours: 48,
    stepHours: 2,
    windFromDeg: 135,
    windMs: 6,
    currentTowardDeg: 300,
    currentMs: 0.2,
    seaStateFactor: 1,
    recovery: { startHour: 6, perHour: 60 },
    shorelines: [
      {
        id: 'marsh',
        name: 'Heron Bay marsh',
        esi: '10A',
        points: [
          { lat: 30.4, lon: -88.4 },
          { lat: 30.4, lon: -87.9 },
        ],
      },
    ],
    notifications: [
      { who: 'National Response Center', minutes: 30 },
      { who: 'State environmental agency', minutes: 60 },
    ],
  })

  it('writes a trajectory, a mass balance series and landfall notes, all valid case data', () => {
    expect(spill.map((d) => d.id)).toEqual([
      'spill-trajectory',
      'spill-mass-balance',
      'spill-arrival',
      'notification-deadlines',
      'spill-landfall',
    ])
    expect(SeriesFile.safeParse(spill[1]!.data).success).toBe(true)
    expect(TextFile.safeParse(spill[4]!.data).success).toBe(true)
    expect(spill[1]!.unit).toBe('bbl')
  })

  it('keeps the mass balance consistent: the parts add up to what was released', () => {
    const pts = spill[1]!.data as { t: string; v: Record<string, number> }[]
    for (const p of pts) {
      const sum = p.v.evaporated! + p.v.dispersed! + p.v.recovered! + p.v.remaining!
      expect(sum).toBeCloseTo(p.v.released!, 1)
    }
    expect(pts[0]!.t).toBe('2026-11-04T12:00:00.000Z')
    expect(pts.at(-1)!.v.released).toBe(4200)
  })

  it('names the shoreline and the earliest contact in case time', () => {
    const notes = spill[4]!.data as { t: string; title: string; text: string }[]
    expect(notes[0]!.title).toBe('Oil may reach Heron Bay marsh (ESI 10A)')
    expect(Date.parse(notes[0]!.t)).toBeGreaterThan(Date.parse('2026-11-04T12:00:00Z'))
    expect(notes[0]!.text).toContain('Simulated for the exercise')
  })

  it('writes no landfall note when the oil never reaches a shoreline', () => {
    const none = generateSpill({
      start: '2026-11-04T12:00:00Z',
      origin: { lat: 30.3, lon: -88.1 },
      product: 'diesel',
      volume: 100,
      unit: 'bbl',
      releaseHours: 0,
      hours: 6,
      stepHours: 1,
      windFromDeg: 0,
      windMs: 2,
      currentTowardDeg: 180,
      currentMs: 0.05,
      seaStateFactor: 1,
      shorelines: [
        {
          id: 'far',
          name: 'Far shore',
          points: [
            { lat: 31.5, lon: -88 },
            { lat: 31.5, lon: -87 },
          ],
        },
      ],
      notifications: [],
    })
    expect(none.map((d) => d.id)).toEqual([
      'spill-trajectory',
      'spill-mass-balance',
      'spill-arrival',
    ])
  })

  it('writes the scoring inputs the metrics read: arrival by shoreline and notification due times', () => {
    const arrival = ModeledSeries.array().parse(spill[2]!.data)
    expect(arrival).toHaveLength(1)
    expect(arrival[0]).toMatchObject({ zone: 'Heron Bay marsh', quantity: 'oil_presence' })
    const values = arrival[0]!.points.map((q) => q.value)
    expect(values[0]).toBe(0)
    expect(values.at(-1)).toBe(1)
    expect([...values].sort()).toEqual(values) // never goes back to zero
    expect(spill[2]).toMatchObject({ shape: 'modeled-series' })
    const due = GroundTruthEvent.array().parse(spill[3]!.data)
    expect(due.map((e) => e.time)).toEqual(['2026-11-04T12:30:00.000Z', '2026-11-04T13:00:00.000Z'])
    expect(due[0]).toMatchObject({
      kind: 'notification_due',
      attrs: { who: 'National Response Center' },
    })
    expect(spill[3]).toMatchObject({ shape: 'ground-truth' })
  })

  it('draws threat zones around the source that shrink with the level', () => {
    const [d] = generatePlume({
      start: '2026-11-04T12:00:00Z',
      source: { lat: 30.3, lon: -88.1 },
      releaseGramsPerSecond: 2000,
      windFromDeg: 250,
      windMs: 3,
      stability: 'D',
      molecularWeight: 70.9,
      substance: 'Chlorine',
      levels: [
        { label: 'Red', ppm: 20 },
        { label: 'Orange', ppm: 2 },
        { label: 'Yellow', ppm: 0.5 },
      ],
      hours: 1,
    })
    const zones = (d!.data as { features: { properties: { level: string; distanceM: number } }[] })
      .features
    expect(zones.map((z) => z.properties.level)).toEqual(['Red', 'Orange', 'Yellow'])
    expect(zones[0]!.properties.distanceM).toBeLessThan(zones[2]!.properties.distanceM)
    expect(d!.label).toBe('Simulated Chlorine plume zones')
  })
})

describe('through the case-data framework', () => {
  beforeEach(() => clearGenerators())

  it('registers the three generators once', () => {
    registerSpillGenerators()
    registerSpillGenerators()
    expect(generatorIds()).toEqual(['spill-simulation', 'toxic-plume', 'trajectory-import'])
    expect(SPILL_GENERATORS).toHaveLength(3)
  })

  it('stores an import as simulated data with the generator named and no retrieval date', async () => {
    registerSpillGenerators()
    const dir = mkdtempSync(join(tmpdir(), 'ttx-traj-'))
    const manifest = await runGenerator(
      dir,
      's1',
      'trajectory-import',
      { content: file([step(0), step(1)]), model: 'PyGNOME', runDate: '2026-11-03' },
      { maxMbPerScenario: 50 },
    )
    expect(manifest.datasets.map((d) => d.id)).toEqual(['trajectory', 'trajectory-run'])
    expect(manifest.datasets[0]!.provenance).toMatchObject({
      origin: 'simulated',
      generator: 'trajectory-import',
    })
    expect(manifest.datasets[0]!.provenance.retrieved).toBeUndefined()
    expect((await readManifest(dir, 's1'))?.datasets).toHaveLength(2)
  })

  it('refuses a bad file before anything is stored', async () => {
    registerSpillGenerators()
    const dir = mkdtempSync(join(tmpdir(), 'ttx-traj-'))
    await expect(
      runGenerator(
        dir,
        's1',
        'trajectory-import',
        { content: '[]', runDate: '2026-11-03' },
        { maxMbPerScenario: 50 },
      ),
    ).rejects.toThrow(/no points with a time/)
    expect((await readManifest(dir, 's1'))?.datasets ?? []).toHaveLength(0)
  })
})
