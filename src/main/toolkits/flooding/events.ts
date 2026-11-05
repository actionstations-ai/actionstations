// Event finder and replay (spec 0454 FR-9): from a gauge record, list the past crests worth
// replaying, choose a window around one and describe the fetch that gets its observed series
// from USGS. The NWS forecast service returns only the current forecast, so a replay has no
// archived forecasts; the notice below is shown in the fetch dialog and the scenario uses
// labeled simulated forecasts (flood-replay-forecast) or none.
import { z } from 'zod'
import type { CaseTimeRange } from '@shared/schemas/case-data'
import { AppError } from '../../lib/errors'
import { CategoryTableSchema, type CategoryTableData } from '../../render/figures/flood/common'
import { categoryAtStage, type FloodCategory } from './lint'

export const REPLAY_FORECAST_NOTICE =
  'The National Weather Service keeps only its current forecast, so the forecasts that were issued during a past flood are not available. ' +
  'The scenario can use forecasts simulated from the observed rise, labeled as simulated, or none.'

const DAY_MS = 86_400_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

export const GaugeRecordSchema = z.object({
  lid: z.string(),
  name: z.string(),
  usgsId: z.string().nullish(),
  timeZone: z.string().nullish(),
  categories: CategoryTableSchema,
  historicCrests: z.array(z.object({ date: z.string(), stage: z.number() })).default([]),
  upstreamLid: z.string().nullish(),
  downstreamLid: z.string().nullish(),
})
export type GaugeRecord = z.infer<typeof GaugeRecordSchema>

const Collection = z.looseObject({
  features: z
    .array(
      z.looseObject({
        properties: z.looseObject({ kind: z.string() }).and(z.record(z.string(), z.unknown())),
      }),
    )
    .min(1),
})

/** The gauge record out of a gauge dataset (as the NWPS connector and the simulator write it). */
export function gaugeRecordFromFeatures(data: unknown): GaugeRecord {
  const fc = Collection.safeParse(data)
  const props = fc.success ? fc.data.features[0]!.properties : undefined
  if (!props || props.kind !== 'flood_gauge')
    throw new AppError('VALIDATION', 'This dataset is not a flood gauge record')
  return GaugeRecordSchema.parse(props)
}

export interface CrestEvent {
  date: string
  stage: number
  category: FloodCategory
}

/** Past crests at a gauge, newest first, optionally within a date range (YYYY-MM-DD or ISO). */
export function crestEvents(g: GaugeRecord, within?: { start: string; end: string }): CrestEvent[] {
  const lo = within ? Date.parse(within.start) : -Infinity
  const hi = within ? Date.parse(within.end) : Infinity
  return g.historicCrests
    .filter((c) => {
      const t = Date.parse(c.date)
      return Number.isFinite(t) && t >= lo && t <= hi
    })
    .map((c) => ({
      date: c.date,
      stage: c.stage,
      category: categoryAtStage(g.categories as CategoryTableData, c.stage),
    }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}

/** The window of a replay: days before the crest for the rise, days after for the fall. */
export function replayWindow(crestDate: string, before = 7, after = 3): CaseTimeRange {
  const t = Date.parse(crestDate)
  if (!Number.isFinite(t)) throw new AppError('VALIDATION', 'The crest date is not a date')
  const day = Math.floor(t / DAY_MS) * DAY_MS
  return { start: iso(day - before * DAY_MS), end: iso(day + (after + 1) * DAY_MS) }
}

export interface ReplayPlan {
  /** The query for the usgs-waterdata connector. */
  usgs: { range: CaseTimeRange; area: { label: string }; options: Record<string, string> }
  /** Shown in the fetch dialog. */
  notice: string
}

/** The fetch that brings a past crest's observed stage into a scenario. */
export function replayPlan(g: GaugeRecord, crest: CrestEvent, before = 7, after = 3): ReplayPlan {
  if (!g.usgsId)
    throw new AppError(
      'VALIDATION',
      `${g.name} has no USGS site number, so its past values cannot be fetched.`,
    )
  const range = replayWindow(crest.date, before, after)
  const days = (Date.parse(range.end) - Date.parse(range.start)) / DAY_MS
  return {
    usgs: {
      range,
      area: { label: g.name },
      options: {
        sites: g.usgsId,
        parameter: 'stage',
        interval: days <= 14 ? 'continuous' : 'daily',
      },
    },
    notice: REPLAY_FORECAST_NOTICE,
  }
}
