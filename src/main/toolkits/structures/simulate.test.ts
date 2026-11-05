// The structures simulations (spec 0471 FR-7): seeded runs repeat; a failure is detectable only
// after its onset; the damage share rises with shaking intensity and with weaker construction;
// the datasets validate, say simulated, and carry the ground truth the metrics read.
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { MonitoringParams, simulateMonitoring } from './monitoring-sim'
import {
  BUILDING_TYPES,
  DamageParams,
  damageChances,
  simulateBuildings,
  truthShares,
} from './damage-sim'
import { inspectionOverlay } from './overlay'

const { generatorIds } = await import('../../case-data/generators')
await import('../generator-modules')
const { monitoringGenerator, damageStatesGenerator } = await import('./generators')

const monitoring = (over: Record<string, unknown> = {}) =>
  MonitoringParams.parse({ start: '2026-11-09T12:00:00Z', failureOnsetHour: 3, ...over })

describe('simulated monitoring', () => {
  it('repeats for the same seed and differs for another', () => {
    const a = simulateMonitoring(monitoring())
    expect(simulateMonitoring(monitoring())).toEqual(a)
    expect(simulateMonitoring(monitoring({ seed: 8 })).samples.map((s) => s.raw)).not.toEqual(
      a.samples.map((s) => s.raw),
    )
  })

  it('crosses the alarm and action levels only after the failure begins', () => {
    const r = simulateMonitoring(monitoring())
    expect(r.onsetAt).toBe('2026-11-09T15:00:00Z')
    expect(r.alarmAt).toBeDefined()
    expect(Date.parse(r.alarmAt!)).toBeGreaterThan(Date.parse(r.onsetAt!))
    expect(Date.parse(r.actionAt!)).toBeGreaterThanOrEqual(Date.parse(r.alarmAt!))
  })

  it('never crosses a level without a failure', () => {
    const r = simulateMonitoring(monitoring({ failureOnsetHour: undefined }))
    expect(r.alarmAt).toBeUndefined()
    expect(r.actionAt).toBeUndefined()
  })

  it('hides readings during a dropout but keeps the truth', () => {
    const r = simulateMonitoring(monitoring({ dropouts: [{ fromHour: 4, toHour: 5 }] }))
    const hidden = r.samples.filter((s) => s.v === null)
    expect(hidden.length).toBeGreaterThan(0)
    expect(hidden.every((s) => Number.isFinite(s.raw))).toBe(true)
    expect(r.dropouts).toEqual([{ start: '2026-11-09T16:00:00Z', end: '2026-11-09T17:00:00Z' }])
  })

  it('shapes the failure: a step jumps, a linear rise is steady, an accelerating one is late', () => {
    const at = (shape: string, hour: number) =>
      simulateMonitoring(
        monitoring({ noise: 0, driftPerHour: 0, failureShape: shape }),
      ).samples.find(
        (s) =>
          s.t ===
          new Date(Date.parse('2026-11-09T12:00:00Z') + hour * 3_600_000)
            .toISOString()
            .replace('.000Z', 'Z'),
      )!.raw
    expect(at('step', 3.5)).toBeGreaterThan(300)
    expect(at('linear', 4.5)).toBeGreaterThan(at('accelerating', 4.5))
  })

  it('refuses an action level below the alarm level', () => {
    expect(() => monitoring({ alarmLevel: 200, actionLevel: 100 })).toThrow()
  })
})

describe('simulated damage states', () => {
  const run = (over: Record<string, unknown> = {}) => simulateBuildings(over)

  it('repeats for the same seed and gives 300 fictional buildings with ids', () => {
    const a = run()
    expect(a).toHaveLength(300)
    expect(run()).toEqual(a)
    expect(new Set(a.map((b) => b.id)).size).toBe(300)
  })

  it('has weaker construction fail at lower intensity', () => {
    expect(damageChances('unreinforced_masonry', 7).moderate).toBeGreaterThan(
      damageChances('steel_frame', 7).moderate,
    )
    for (const t of BUILDING_TYPES) {
      const c = damageChances(t, 8)
      expect(c.severe).toBeLessThan(c.moderate)
      expect(damageChances(t, 9).severe).toBeGreaterThan(c.severe)
    }
  })

  it('raises the share of yellow and red placards with shaking intensity', () => {
    const share = (peakMmi: number) => {
      const s = truthShares(run({ peakMmi, fallPerKm: 0, seed: 3 }))
      return s['RESTRICTED USE'] + s.UNSAFE
    }
    expect(share(6)).toBeLessThan(share(7.5))
    expect(share(7.5)).toBeLessThan(share(9))
    expect(truthShares(run({ peakMmi: 5, fallPerKm: 0 })).UNSAFE).toBeLessThan(0.05)
  })

  it('uses a simulated earthquake and a shake grid for the shaking when given', () => {
    const quake = run({ earthquakeMagnitude: 7, buildingCount: 50 })
    expect(Math.max(...quake.map((b) => b.mmi))).toBeGreaterThan(
      Math.min(...quake.map((b) => b.mmi)),
    )
    const grid = {
      west: -82,
      south: 41,
      east: -81,
      north: 42,
      cols: 2,
      rows: 2,
      values: [9, 9, 9, 9],
    }
    const shaken = run({ shakeGrid: grid, buildingCount: 40 })
    expect(shaken.every((b) => b.mmi > 8)).toBe(true)
    expect(() => DamageParams.parse({ shakeGrid: { ...grid, values: [1] } })).toThrow()
  })

  it('draws the overlay with placards as words and times from the postings', () => {
    const b = run({ buildingCount: 10 })
    const layer = inspectionOverlay(b, {
      [b[0]!.id]: { placard: 'UNSAFE', postedAt: '2026-11-06T10:40:00Z' },
    })
    expect(layer.kind).toBe('point')
    const feats = (
      layer as { features: { label: string; time?: { start: string }; style: string }[] }
    ).features
    expect(feats[0]).toMatchObject({ style: 'critical', time: { start: '2026-11-06T10:40:00Z' } })
    expect(feats[0]!.label).toContain('UNSAFE')
    expect(feats[1]!.label).toContain('NOT YET EVALUATED')
  })
})

describe('generators', () => {
  it('are registered through the shared module', () => {
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['structures-monitoring', 'structures-damage-states']),
    )
  })

  it('write labeled, valid datasets with the events and series the metrics read', () => {
    const out = monitoringGenerator.generate(
      monitoring({ dropouts: [{ fromHour: 5, toHour: 5.5 }] }),
    )
    expect(out.map((d) => d.id)).toEqual([
      'monitoring-lc-14',
      'monitoring-truth',
      'monitoring-action-series',
    ])
    for (const d of out) expect(d.label).toMatch(/simulated/)
    const truth = (out[1]!.data as { events: unknown[] }).events.map((e) =>
      GroundTruthEvent.parse(e),
    )
    expect(truth.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['failure_onset', 'threshold_crossing', 'sensor_dropout']),
    )
    const series = ModeledSeries.parse((out[2]!.data as { series: unknown[] }).series[0])
    expect(series.points.some((p) => p.value > 0)).toBe(true)
    expect(series.points[0]!.value).toBeLessThan(0)
  })

  it('write one truth event per building and a program summary', () => {
    const out = damageStatesGenerator.generate(DamageParams.parse({ buildingCount: 40 }))
    expect(out.map((d) => d.id)).toEqual(['inspection-buildings', 'inspection-truth'])
    for (const d of out) expect(d.label).toMatch(/simulated/)
    const events = (out[1]!.data as { events: unknown[] }).events.map((e) =>
      GroundTruthEvent.parse(e),
    )
    expect(events.filter((e) => e.kind === 'building_truth')).toHaveLength(40)
    expect(events.filter((e) => e.kind === 'program_truth')).toHaveLength(1)
    const features = (out[0]!.data as { features: { properties: Record<string, unknown> }[] })
      .features
    expect(features).toHaveLength(40)
    expect(JSON.stringify(features)).not.toMatch(/truthPlacard|UNSAFE/)
  })
})
