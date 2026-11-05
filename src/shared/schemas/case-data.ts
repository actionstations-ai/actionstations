// Case data (spec 0448 FR-7..FR-10, ADR-0076): datasets indexed by time, stored in
// scenarios/<id>/case/ with provenance. `manifest.json` is a loose object (ADR-0016) so a newer
// build's keys survive a save by this one.
import { z } from 'zod'
import { IsoDateTime, SafeId } from './common'

export const CaseDatasetKind = z.enum(['series', 'features', 'raster', 'text', 'reports'])
export type CaseDatasetKind = z.infer<typeof CaseDatasetKind>

/** The two words shown wherever case data appears. */
export const CaseOrigin = z.enum(['historical', 'simulated'])
export type CaseOrigin = z.infer<typeof CaseOrigin>

const text = (max: number) => z.string().max(max)

/**
 * Where a dataset came from. Historical data names its source and retrieval date; simulated data
 * names the generator and is never given a retrieval date (spec 0448 NFR-5).
 */
export const CaseProvenance = z
  .object({
    origin: CaseOrigin,
    source: text(200).min(1),
    retrieved: IsoDateTime.optional(),
    terms: text(400).default(''),
    citation: text(600).default(''),
    /** Set when the data was changed (cropped, resampled, filtered): what was done. */
    modified: text(400).optional(),
    /** Simulated data: the generator id. */
    generator: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      .optional(),
  })
  .superRefine((p, ctx) => {
    const bad = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (p.origin === 'historical' && !p.retrieved)
      bad('retrieved', 'Historical data needs a retrieval date')
    if (p.origin === 'historical' && p.generator)
      bad('generator', 'Historical data has no generator')
    if (p.origin === 'simulated' && !p.generator)
      bad('generator', 'Simulated data names its generator')
    if (p.origin === 'simulated' && p.retrieved)
      bad('retrieved', 'Simulated data was never retrieved')
  })
export type CaseProvenance = z.infer<typeof CaseProvenance>

export const CaseArea = z.object({
  label: text(120).default(''),
  /** west, south, east, north */
  bbox: z
    .tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ])
    .optional(),
})
export type CaseArea = z.infer<typeof CaseArea>

export const CaseTimeRange = z.object({ start: IsoDateTime, end: IsoDateTime })
export type CaseTimeRange = z.infer<typeof CaseTimeRange>

/** A relative file name inside case/: letters, digits, dot, dash, underscore, one folder deep. */
export const CaseFileName = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,80})?$/,
    'Invalid case file name',
  )
  .refine((n) => !n.includes('..'), 'Invalid case file name')
export const CASE_FILE_EXTENSIONS = ['json', 'geojson', 'png', 'webp', 'txt', 'md'] as const

export const CaseRasterFrame = z.object({
  t: IsoDateTime,
  file: CaseFileName,
  /** west, south, east, north of the image (georeference). */
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
})
export type CaseRasterFrame = z.infer<typeof CaseRasterFrame>

export const CaseDataset = z.object({
  id: SafeId,
  kind: CaseDatasetKind,
  label: text(120).min(1),
  provenance: CaseProvenance,
  range: CaseTimeRange.optional(),
  area: CaseArea.optional(),
  /** series, features, text and reports: the data file. Rasters list frames instead. */
  file: CaseFileName.optional(),
  frames: z.array(CaseRasterFrame).max(2000).optional(),
  unit: text(40).optional(),
  /**
   * A dataset made for scoring rather than for injects: `modeled-series` is a list of zone series
   * (a modeled quantity by area over time) and `ground-truth` a list of events, the shapes the
   * field metrics read. Injects do not reference these.
   */
  shape: z.enum(['modeled-series', 'ground-truth']).optional(),
  bytes: z.number().int().nonnegative().default(0),
})
export type CaseDataset = z.infer<typeof CaseDataset>

/** A time jump: at `atMin` of exercise time the case clock skips ahead `skipMin` more minutes. */
export const CaseJump = z.object({
  atMin: z.number().nonnegative().max(1440),
  skipMin: z
    .number()
    .positive()
    .max(60 * 24 * 366),
  rowId: z.string().max(64).optional(),
})
export type CaseJump = z.infer<typeof CaseJump>

/**
 * Exercise time to case time (spec 0448 FR-9): at exercise minute 0 the case clock reads
 * `caseStart + startOffsetMin`; it then runs `speed` case minutes per exercise minute, plus each
 * jump's skip once the exercise clock has reached the jump.
 */
export const CaseTimeMapping = z.object({
  caseStart: IsoDateTime,
  startOffsetMin: z
    .number()
    .min(0)
    .max(60 * 24 * 366)
    .default(0),
  speed: z.number().positive().max(1000).default(1),
  jumps: z.array(CaseJump).max(50).default([]),
})
export type CaseTimeMapping = z.infer<typeof CaseTimeMapping>

export const CaseManifest = z.looseObject({
  version: z.literal(1).default(1),
  datasets: z.array(CaseDataset).max(200).default([]),
  timeMapping: CaseTimeMapping.optional(),
})
export type CaseManifest = z.infer<typeof CaseManifest>

export const DEFAULT_CASE_LIMIT_MB = 500

/** Settings: case data limits. */
export const CaseDataSettings = z.object({
  /** Most megabytes of case data one scenario may hold. */
  maxMbPerScenario: z.number().int().min(1).max(10_000).default(DEFAULT_CASE_LIMIT_MB),
  /**
   * The user's own contact email, sent in the User-Agent to archives whose fair-access rules ask
   * for one (SEC EDGAR). Empty until the user sets it; never filled in by the app.
   */
  contactEmail: z
    .string()
    .max(200)
    .refine((v) => v === '' || /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(v), {
      message: 'Enter an email address, or leave it empty',
    })
    .default(''),
})
export type CaseDataSettings = z.infer<typeof CaseDataSettings>

/** Data file shapes. */
export const SeriesPoint = z.object({
  t: IsoDateTime,
  v: z.union([z.number(), z.record(z.string(), z.number())]),
})
export const SeriesFile = z.array(SeriesPoint).max(200_000)
export const TextEntry = z.object({
  t: IsoDateTime,
  title: text(200).optional(),
  text: text(20_000),
})
export const TextFile = z.array(TextEntry).max(20_000)
export type SeriesPoint = z.infer<typeof SeriesPoint>
export type TextEntry = z.infer<typeof TextEntry>

/**
 * An inject field that points into case data. `time` is an absolute case time (ISO); `offset` is
 * minutes after the dataset's start; with neither, the inject's own exercise time is mapped to
 * case time.
 */
export const CaseRef = z.union([
  z.strictObject({ dataset: SafeId }),
  z.strictObject({ dataset: SafeId, time: IsoDateTime }),
  z.strictObject({
    dataset: SafeId,
    offset: z
      .number()
      .min(0)
      .max(60 * 24 * 366),
  }),
])
export type CaseRef = z.infer<typeof CaseRef>

/** A reference resolved at render: the value plus the labels that must travel with it. */
export interface ResolvedCase {
  dataset: string
  kind: CaseDatasetKind
  datasetLabel: string
  origin: CaseOrigin
  /** "Historical data, NOAA, retrieved 2026-03-02" */
  label: string
  caseTime: string
  /** Display text for the value. */
  display: string
  value: unknown
  source: string
  retrieved?: string
  modified?: string
}
