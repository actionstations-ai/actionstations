// The clinical downtime generator (issue #1130): deterministic, labeled simulated, and its
// datasets are the shapes the case data store and the measures accept.
import { describe, expect, it } from 'vitest'
import { GroundTruthEvent } from '@shared/schemas/metrics'
import { SeriesFile } from '@shared/schemas/case-data'
import { ClinicalDowntimeParams, clinicalDowntimeDatasets } from './generators'

const params = ClinicalDowntimeParams.parse({ start: '2026-11-12T02:00:00.000Z' })

describe('clinical downtime generator', () => {
  const out = clinicalDowntimeDatasets(params)

  it('gives the same data for the same parameters', () => {
    expect(clinicalDowntimeDatasets(params)).toEqual(out)
  })

  it('writes a queue series and the ground-truth events, each labeled simulated', () => {
    expect(out.map((d) => [d.id, d.kind, d.shape])).toEqual([
      ['downtime-queues', 'series', undefined],
      ['clinical-systems-events', 'reports', 'ground-truth'],
    ])
    for (const d of out) expect(d.label).toMatch(/simulated/)
    expect(SeriesFile.safeParse(out[0]!.data).success).toBe(true)
    for (const e of out[1]!.data as unknown[])
      expect(GroundTruthEvent.safeParse(e).success).toBe(true)
  })

  it('uses the toolkit defaults: four feeds down for six hours on four units', () => {
    expect(params).toMatchObject({
      durationHours: 6,
      failedFeeds: ['lab_results', 'orders', 'adt', 'pharmacy'],
      units: ['4 West', '5 East', 'Intensive care unit', 'Emergency department'],
      fullBackEntryHours: 8,
    })
  })

  it('carries the full back-entry limit in the case, so play reads the same scope', () => {
    const start = (out[1]!.data as GroundTruthEvent[]).find((e) => e.kind === 'downtime_start')!
    expect(start.attrs.setup).toMatchObject({ fullBackEntryHours: 8 })
    const custom = ClinicalDowntimeParams.parse({ start: params.start, fullBackEntryHours: 4 })
    const event = (clinicalDowntimeDatasets(custom)[1]!.data as GroundTruthEvent[])[0]!
    expect(event.attrs.setup).toMatchObject({ fullBackEntryHours: 4 })
  })
})
