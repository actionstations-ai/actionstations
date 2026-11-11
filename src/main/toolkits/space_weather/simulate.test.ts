// Simulated space weather events and the GNSS model (spec 0468 FR-8, FR-9): the same parameters
// give the same data, the Kp trajectory peaks at the stated G level, the SWPC messages come in
// order, holdover falls only while GNSS is unusable, and every dataset is labeled simulated.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { SpaceEventParams, simulateEvent, kpSeries, PEAK_KP_FOR_G } = await import('./simulate')
const { gLevelOfKp, flareClass } = await import('../../render/figures/space/common')
const { sLevelForFlux, rLevelForXray } = await import('./lint')
const { gnssModel, holdoverZones } = await import('./gnss')
const { runGenerator, generatorIds } = await import('../../case-data/generators')
await import('./register-generators')
const { readModeledSeries, readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { caseDir } = await import('../../case-data/store')

const params = (over: Record<string, unknown> = {}) =>
  SpaceEventParams.parse({
    flareTime: '2026-11-05T09:00:00Z',
    flareClass: 'X2.1',
    peakG: 4,
    peakS: 3,
    cmeSpeedKmS: 1500,
    receivers: [
      { name: 'Harbor central office', class: 'disciplined_oscillator', holdoverHours: 8 },
      { name: 'Pine Ridge tower', class: 'multi_frequency' },
    ],
    ...over,
  })

describe('event series', () => {
  it('gives the same data for the same parameters', () => {
    expect(simulateEvent(params())).toEqual(simulateEvent(params()))
  })
  it.each([1, 2, 3, 4, 5])('peaks Kp at the stated level G%i and never above it', (g) => {
    const kp = kpSeries(params({ peakG: g }))
    const peak = Math.max(...kp.map((p) => p.v))
    expect(peak).toBe(PEAK_KP_FOR_G[g])
    expect(gLevelOfKp(peak)).toBe(g)
    expect(kp.every((p) => Date.parse(p.t) % (3 * 3_600_000) === 0)).toBe(true)
  })
  it('draws the stated flare class and the proton level', () => {
    const e = simulateEvent(params())
    const xmax = Math.max(...e.xray.map((p) => p.v))
    expect(flareClass(xmax).startsWith('X2')).toBe(true)
    expect(rLevelForXray('X', 2.1)).toBe(3)
    expect(sLevelForFlux(Math.max(...e.proton.map((p) => p.v)))).toBe(3)
  })
  it('puts the shock arrival after the flare by the CME transit time and steps the wind', () => {
    const e = simulateEvent(params())
    expect(e.clock.transitH).toBeCloseTo(149_600_000 / 1500 / 3600, 5)
    const before = e.wind.filter((p) => Date.parse(p.t) < e.clock.arrival - 600_000).at(-1)!.v
    const after = e.wind.find((p) => Date.parse(p.t) >= e.clock.arrival + 3_600_000)!.v
    expect(after).toBeGreaterThan(before + 100)
  })
  it('keeps the GIC relation proportional to the ground conductivity factor', () => {
    const lo = simulateEvent(params({ groundConductivityFactor: 1 })).gic
    const hi = simulateEvent(params({ groundConductivityFactor: 2 })).gic
    const peak = (s: { v: number }[]) => Math.max(...s.map((p) => p.v))
    expect(peak(hi)).toBeGreaterThan(peak(lo) * 1.5)
  })
})

describe('message sequence', () => {
  it('runs watch, warnings, sudden impulse summary and alerts in time order with lead times', () => {
    const e = simulateEvent(params())
    const kinds = e.messages.map((m) => m.kind)
    expect(kinds[0]).toBe('WATCH')
    expect(kinds[1]).toBe('WARNING')
    expect(kinds.filter((k) => k === 'ALERT').length).toBeGreaterThanOrEqual(1)
    const times = e.messages.map((m) => Date.parse(m.time))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(Date.parse(e.messages[0]!.time)).toBeLessThanOrEqual(e.clock.arrival - 20 * 3_600_000)
    expect(Date.parse(e.messages[0]!.time)).toBeGreaterThan(e.clock.flare)
    expect(Date.parse(e.messages[1]!.time)).toBe(e.clock.arrival - 3_600_000)
    const sud = e.messages.find((m) => m.code === 'SUMSUD')!
    expect(sud.headline).toBe('Geomagnetic Sudden Impulse')
    expect(Date.parse(sud.time)).toBeGreaterThan(e.clock.arrival)
  })
  it('uses the SWPC watch code of the predicted G level and K-index alerts up to 9', () => {
    const codes = (g: number) => simulateEvent(params({ peakG: g })).messages.map((m) => m.code)
    expect(codes(1)).toContain('WATA20')
    expect(codes(2)).toContain('WATA30')
    expect(codes(3)).toContain('WATA50')
    expect(codes(4)).toContain('WATA99')
    expect(codes(5)).toEqual(expect.arrayContaining(['WATA99', 'WARK07', 'ALTK08', 'ALTK09']))
    const k7 = simulateEvent(params({ peakG: 5 })).messages.find((m) => m.code === 'WARK07')!
    expect(k7.headline).toBe('Geomagnetic K-index of 7 or greater expected')
  })
  it('never issues the watch before the eruption, even for a fast CME', () => {
    const e = simulateEvent(params({ cmeSpeedKmS: 3500 }))
    expect(Date.parse(e.messages[0]!.time)).toBeGreaterThan(e.clock.flare)
    expect(Date.parse(e.messages[0]!.time)).toBeLessThan(e.clock.arrival)
  })
  it('writes no messages when there is no geomagnetic storm', () => {
    expect(simulateEvent(params({ peakG: 0 })).messages).toEqual([])
  })
})

describe('GNSS model', () => {
  const kp = kpSeries(params())
  const doscil = gnssModel(
    kp,
    { name: 'Harbor', class: 'disciplined_oscillator', holdoverHours: 8, errorLimitM: 5 },
    48,
  )
  it('rises with Kp and lingers after the peak for the scintillation hours', () => {
    const peakErr = Math.max(...doscil.error.map((p) => p.v))
    expect(peakErr).toBeGreaterThan(5)
    const peakIdx = doscil.error.findIndex((p) => p.v === peakErr)
    const lastHigh = doscil.error.findLastIndex((p) => p.v > 5)
    expect(lastHigh).toBeGreaterThan(peakIdx + 8)
    const short = gnssModel(kp, { ...doscil.receiver }, 3)
    expect(short.error.filter((p) => p.v > 5).length).toBeLessThan(
      doscil.error.filter((p) => p.v > 5).length,
    )
  })
  it('lets multi-frequency receivers do better than single-frequency ones', () => {
    const single = gnssModel(kp, { name: 's', class: 'single_frequency', errorLimitM: 5 }, 12)
    const multi = gnssModel(kp, { name: 'm', class: 'multi_frequency', errorLimitM: 5 }, 12)
    const peak = (s: typeof single) => Math.max(...s.error.map((p) => p.v))
    expect(peak(single)).toBeGreaterThan(peak(multi))
  })
  it('lowers holdover only while GNSS is unusable and stops at zero', () => {
    const h = doscil.holdover.map((p) => p.v)
    expect(h[0]).toBe(8)
    expect(h.every((v, i) => i === 0 || v <= h[i - 1]!)).toBe(true)
    expect(Math.min(...h)).toBe(0)
    expect(doscil.holdoverExpiredAt).toBeTruthy()
    const firstAlarm = Date.parse(doscil.alarms[0]!.t)
    const flat = doscil.holdover.filter((p) => Date.parse(p.t) < firstAlarm)
    expect(flat.every((p) => p.v === 8)).toBe(true)
  })
  it('makes a zone series that crosses zero when holdover expires', () => {
    const zones = holdoverZones([doscil])
    expect(zones).toHaveLength(1)
    const cross = zones[0]!.points.find((p) => p.value >= 0)!
    expect(cross.time).toBe(doscil.holdoverExpiredAt)
  })
  it('requires holdover hours for a disciplined oscillator', () => {
    expect(() =>
      SpaceEventParams.parse({
        flareTime: '2026-11-05T09:00:00Z',
        flareClass: 'M5',
        peakG: 2,
        receivers: [{ name: 'x', class: 'disciplined_oscillator' }],
      }),
    ).toThrow(/holdover/)
  })
})

describe('the generator', () => {
  it('is registered and labels every dataset simulated', async () => {
    expect(generatorIds()).toContain('space-weather-event')
    const root = mkdtempSync(join(tmpdir(), 'ttx-space-'))
    const m = await runGenerator(root, 's', 'space-weather-event', params(), {
      maxMbPerScenario: 500,
    })
    expect(m.datasets.length).toBeGreaterThan(10)
    for (const d of m.datasets) {
      expect(d.provenance.origin).toBe('simulated')
      expect(d.label.toLowerCase()).toContain('simulated')
    }
    const ids = m.datasets.map((d) => d.id)
    for (const id of [
      'kp',
      'xray-flux',
      'space-events',
      'zones-procedure',
      'zones-holdover',
      'zones-safe-mode',
    ])
      expect(ids).toContain(id)
  })
  it('writes the events and zone series the metrics read', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-space-'))
    const m = await runGenerator(root, 's', 'space-weather-event', params(), {
      maxMbPerScenario: 500,
    })
    const dir = caseDir(root, 's')
    const events = await readGroundTruth(
      dir,
      m.datasets.find((d) => d.id === 'space-events')!.file!,
    )
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['flare', 'storm_onset', 'kp_condition_met', 'swpc_message']),
    )
    const proc = await readModeledSeries(
      dir,
      m.datasets.find((d) => d.id === 'zones-procedure')!.file!,
    )
    expect(proc[0]!.points.some((p) => p.value >= 0)).toBe(true)
  })
})
