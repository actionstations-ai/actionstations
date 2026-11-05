// Case data manifest, provenance and reference shapes (spec 0448 FR-7, NFR-5).
import { describe, expect, it } from 'vitest'
import { CaseManifest, CaseProvenance, CaseRef, CaseTimeMapping } from './case-data'

const historical = {
  origin: 'historical',
  source: 'NOAA Storm Events',
  retrieved: '2026-03-02T10:00:00Z',
  terms: 'Public domain',
  citation: 'NOAA NCEI Storm Events Database',
} as const

const dataset = (extra: Record<string, unknown> = {}) => ({
  id: 'gauge',
  kind: 'series',
  label: 'Gauge height',
  file: 'gauge.json',
  provenance: historical,
  ...extra,
})

describe('case manifest', () => {
  it('accepts datasets of every kind', () => {
    for (const kind of ['series', 'features', 'raster', 'text', 'reports'])
      expect(CaseManifest.safeParse({ datasets: [dataset({ kind })] }).success).toBe(true)
  })

  it('refuses an unknown dataset kind', () => {
    expect(CaseManifest.safeParse({ datasets: [dataset({ kind: 'video' })] }).success).toBe(false)
  })

  it('refuses a data file name that leaves the case folder', () => {
    for (const file of ['../x.json', '/etc/passwd', 'a/b/c.json', 'C:\\x.json'])
      expect(CaseManifest.safeParse({ datasets: [dataset({ file })] }).success).toBe(false)
  })

  it('keeps keys written by a newer build', () => {
    const parsed = CaseManifest.parse({ datasets: [], futureKey: { a: 1 } })
    expect((parsed as Record<string, unknown>).futureKey).toEqual({ a: 1 })
  })

  it('fills the empty defaults', () => {
    expect(CaseManifest.parse({})).toMatchObject({ version: 1, datasets: [] })
  })
})

describe('provenance', () => {
  it('needs a retrieval date for historical data', () => {
    const { retrieved: _drop, ...rest } = historical
    expect(CaseProvenance.safeParse(rest).success).toBe(false)
    expect(CaseProvenance.safeParse(historical).success).toBe(true)
  })

  it('names the generator for simulated data and gives it no retrieval date', () => {
    const sim = { origin: 'simulated', source: 'Storm track', generator: 'storm-track' }
    expect(CaseProvenance.safeParse(sim).success).toBe(true)
    expect(CaseProvenance.safeParse({ ...sim, generator: undefined }).success).toBe(false)
    expect(CaseProvenance.safeParse({ ...sim, retrieved: '2026-03-02T10:00:00Z' }).success).toBe(
      false,
    )
  })

  it('does not let historical data claim a generator', () => {
    expect(CaseProvenance.safeParse({ ...historical, generator: 'storm-track' }).success).toBe(
      false,
    )
  })
})

describe('inject references', () => {
  it('takes a dataset with a time, an offset or neither', () => {
    expect(CaseRef.safeParse({ dataset: 'gauge' }).success).toBe(true)
    expect(CaseRef.safeParse({ dataset: 'gauge', time: '2024-09-26T14:00:00Z' }).success).toBe(true)
    expect(CaseRef.safeParse({ dataset: 'gauge', offset: 90 }).success).toBe(true)
  })

  it('refuses both time and offset, extra keys and a bad time', () => {
    expect(
      CaseRef.safeParse({ dataset: 'g', time: '2024-09-26T14:00:00Z', offset: 5 }).success,
    ).toBe(false)
    expect(CaseRef.safeParse({ dataset: 'g', other: 1 }).success).toBe(false)
    expect(CaseRef.safeParse({ dataset: 'g', time: 'yesterday' }).success).toBe(false)
  })
})

describe('time mapping defaults', () => {
  it('starts at offset 0, speed 1, no jumps', () => {
    expect(CaseTimeMapping.parse({ caseStart: '2024-09-26T12:00:00Z' })).toEqual({
      caseStart: '2024-09-26T12:00:00Z',
      startOffsetMin: 0,
      speed: 1,
      jumps: [],
    })
  })
})
