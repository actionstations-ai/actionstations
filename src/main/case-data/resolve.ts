// Resolving an inject's case data references at render (spec 0448 FR-7, FR-9, NFR-5). A field
// that holds `{ dataset, time }`, `{ dataset, offset }` or `{ dataset }` is replaced, for the
// render only, by the value's display text; the full resolved values (with their historical or
// simulated label) go into the template context as `caseData`, keyed by field name. The inject
// on disk keeps the reference.
import {
  CaseRef,
  type CaseDataset,
  type CaseManifest,
  type ResolvedCase,
} from '@shared/schemas/case-data'
import { caseTimeMs, formatCaseTime, offsetToCaseMs } from '@shared/case-time'
import { AppError } from '../lib/errors'

export interface ResolveContext {
  manifest: CaseManifest
  /** The dataset's parsed data file (series, text, reports, features); undefined for rasters. */
  readData: (dataset: CaseDataset) => Promise<unknown>
  /** Absolute path of a raster frame file. */
  framePath: (file: string) => string
  /** The inject's own exercise minute, for a reference with no time. */
  exerciseMin: number | undefined
}

/** "Historical data, NOAA, retrieved 2026-03-02" / "Simulated data, example-ramp". */
export function originLabel(d: Pick<CaseDataset, 'provenance'>): string {
  const p = d.provenance
  if (p.origin === 'simulated') return `Simulated data (${p.source})`
  const when = p.retrieved ? `, retrieved ${p.retrieved.slice(0, 10)}` : ''
  return `Historical data (${p.source}${when})${p.modified ? ', modified' : ''}`
}

function caseMsFor(ref: CaseRef, dataset: CaseDataset, ctx: ResolveContext): number {
  if ('time' in ref) return Date.parse(ref.time)
  if ('offset' in ref) {
    if (!dataset.range)
      throw new AppError('VALIDATION', `Dataset ${dataset.id} has no time range for an offset`)
    return offsetToCaseMs(dataset.range.start, ref.offset)
  }
  const map = ctx.manifest.timeMapping
  if (!map)
    throw new AppError('VALIDATION', 'Case data has no time mapping, so a reference needs a time')
  if (ctx.exerciseMin === undefined)
    throw new AppError('VALIDATION', 'This inject has no exercise time to map to case time')
  return caseTimeMs(ctx.exerciseMin, map)
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

/** The last entry at or before `ms`; throws when the data starts later. */
function latest<T extends { t: string }>(items: T[], ms: number, dataset: string): T {
  let best: T | undefined
  for (const item of items) {
    const t = Date.parse(item.t)
    if (t <= ms && (!best || t >= Date.parse(best.t))) best = item
  }
  if (!best)
    throw new AppError(
      'VALIDATION',
      `Dataset ${dataset} has no data at or before ${formatCaseTime(ms)}`,
    )
  return best
}

interface Feature {
  properties?: { name?: unknown; start?: unknown; end?: unknown } | null
}

function activeFeatures(data: unknown, ms: number): Feature[] {
  const all = (data as { features?: Feature[] } | undefined)?.features ?? []
  return all.filter((f) => {
    const start =
      typeof f.properties?.start === 'string' ? Date.parse(f.properties.start) : -Infinity
    const end = typeof f.properties?.end === 'string' ? Date.parse(f.properties.end) : Infinity
    return start <= ms && ms <= end
  })
}

function valueOf(
  dataset: CaseDataset,
  data: unknown,
  ms: number,
  ctx: ResolveContext,
): { value: unknown; display: string } {
  if (dataset.kind === 'series') {
    const point = latest(
      data as { t: string; v: number | Record<string, number> }[],
      ms,
      dataset.id,
    )
    const unit = dataset.unit ? ` ${dataset.unit}` : ''
    const display =
      typeof point.v === 'number'
        ? `${num(point.v)}${unit}`
        : Object.entries(point.v)
            .map(([k, v]) => `${k} ${num(v)}${unit}`)
            .join(', ')
    return { value: point.v, display }
  }
  if (dataset.kind === 'features') {
    const features = activeFeatures(data, ms)
    const names = features.map((f) => String(f.properties?.name ?? '')).filter(Boolean)
    return {
      value: features,
      display: names.length ? names.join(', ') : `${features.length} features`,
    }
  }
  if (dataset.kind === 'raster') {
    const frame = latest(dataset.frames ?? [], ms, dataset.id)
    return {
      value: { file: ctx.framePath(frame.file), bounds: frame.bounds, t: frame.t },
      display: `Image from ${formatCaseTime(Date.parse(frame.t))}`,
    }
  }
  const entry = latest(data as { t: string; title?: string; text: string }[], ms, dataset.id)
  return { value: entry, display: entry.title ? `${entry.title}\n${entry.text}` : entry.text }
}

export async function resolveRef(ref: CaseRef, ctx: ResolveContext): Promise<ResolvedCase> {
  const dataset = ctx.manifest.datasets.find((d) => d.id === ref.dataset)
  if (!dataset)
    throw new AppError('NOT_FOUND', `Case dataset ${ref.dataset} is not in this scenario`)
  const ms = caseMsFor(ref, dataset, ctx)
  const data = dataset.kind === 'raster' ? undefined : await ctx.readData(dataset)
  const { value, display } = valueOf(dataset, data, ms, ctx)
  const p = dataset.provenance
  return {
    dataset: dataset.id,
    kind: dataset.kind,
    datasetLabel: dataset.label,
    origin: p.origin,
    label: originLabel(dataset),
    caseTime: new Date(ms).toISOString(),
    display,
    value,
    source: p.source,
    ...(p.retrieved ? { retrieved: p.retrieved } : {}),
    ...(p.modified ? { modified: p.modified } : {}),
  }
}

export interface ResolvedFields {
  /** The fields with each reference replaced by its display text. */
  fields: Record<string, unknown>
  /** Field name (dotted path) to the full resolved value. */
  caseData: Record<string, ResolvedCase>
  /** The distinct origin labels, to print on the document. */
  labels: string[]
}

const MAX_DEPTH = 6

async function walk(
  value: unknown,
  path: string,
  depth: number,
  ctx: ResolveContext,
  out: Record<string, ResolvedCase>,
): Promise<unknown> {
  const ref = CaseRef.safeParse(value)
  if (ref.success) {
    const resolved = await resolveRef(ref.data, ctx)
    out[path] = resolved
    return resolved.display
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    const items: unknown[] = []
    for (const [i, v] of value.entries())
      items.push(await walk(v, `${path}.${i}`, depth + 1, ctx, out))
    return items
  }
  const copy: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value))
    copy[k] = await walk(v, path ? `${path}.${k}` : k, depth + 1, ctx, out)
  return copy
}

/** Replace every case reference in an inject's fields. A field set with no reference is returned as is. */
export async function resolveInjectFields(
  fields: Record<string, unknown>,
  ctx: ResolveContext,
): Promise<ResolvedFields> {
  const caseData: Record<string, ResolvedCase> = {}
  const resolved = (await walk(fields, '', 0, ctx, caseData)) as Record<string, unknown>
  const labels = [...new Set(Object.values(caseData).map((r) => r.label))]
  return { fields: resolved, caseData, labels }
}

/** True when any field holds a reference (cheap check before reading the manifest). */
export function hasCaseRefs(value: unknown, depth = 0): boolean {
  if (CaseRef.safeParse(value).success) return true
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return false
  return Object.values(value).some((v) => hasCaseRefs(v, depth + 1))
}
