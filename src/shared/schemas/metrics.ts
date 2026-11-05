// Field metrics (spec 0448 FR-12, FR-13): the input types every metric reads and the result
// shape the Evaluation screen and the AAR show. A result carries the inputs it was computed from
// so a reader can check the numbers, and the caveats that limit how far they can be trusted.
import { z } from 'zod'
import { IsoDateTime } from './common'

const label = z.string().min(1).max(200)
const value = z.string().max(2000)

/** One thing that happened in the world, from case data (historical or simulated). */
export const GroundTruthEvent = z.object({
  id: z.string().min(1).max(120),
  time: IsoDateTime,
  area: z.string().max(200).optional(),
  kind: z.string().min(1).max(80),
  attrs: z.record(z.string(), z.unknown()).default({}),
})
export type GroundTruthEvent = z.infer<typeof GroundTruthEvent>

/** One timestamped decision a participant group made, read from the session log. */
export const MetricDecision = z.object({
  id: z.string().min(1).max(120),
  time: IsoDateTime,
  kind: z.string().min(1).max(80),
  area: z.string().max(200).optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
})
export type MetricDecision = z.infer<typeof MetricDecision>

/** A modeled quantity over time in one zone (wind speed, river stage). */
export const ModeledSeries = z.object({
  zone: z.string().min(1).max(200),
  quantity: z.string().min(1).max(120),
  points: z.array(z.object({ time: IsoDateTime, value: z.number() })).max(50_000),
})
export type ModeledSeries = z.infer<typeof ModeledSeries>

export const MetricInput = z.object({ label, value })
export type MetricInput = z.infer<typeof MetricInput>

export const MetricTable = z.object({
  title: z.string().max(200),
  columns: z.array(z.string().max(200)).max(20),
  rows: z.array(z.array(z.string().max(1000)).max(20)).max(5000),
})
export type MetricTable = z.infer<typeof MetricTable>

/** What a metric returns and what is stored with the session record. */
export const MetricResult = z.object({
  metricId: z.string().min(1).max(80),
  title: z.string().max(200),
  computedAt: IsoDateTime,
  sessionId: z.string().max(64).optional(),
  /** The configuration the metric ran with. */
  config: z.record(z.string(), z.unknown()),
  /** Where the numbers came from, in words a reader can check. */
  inputs: z.array(MetricInput).max(200),
  /** Headline numbers; a number that cannot be computed reads "n/a". */
  summary: z.array(MetricInput).max(100),
  tables: z.array(MetricTable).max(10),
  caveats: z.array(z.string().max(1000)).max(20),
  /** The same numbers for code that reads them (null where undefined). */
  data: z.record(z.string(), z.unknown()),
})
export type MetricResult = z.infer<typeof MetricResult>

/** A metric a toolkit names, with its configuration. */
export const MetricRef = z.object({
  id: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()).default({}),
})
export type MetricRef = z.infer<typeof MetricRef>
